import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getConfig } from '@/core/company/config';
import { formatMoney, moneyFromJSON } from '@/core/money';
import { isModuleEnabled } from '@/core/modules/registry';
import type { Role } from '@/core/modules/types';
import { navFor } from '@/core/nav';
import { ordersSummary } from '@/modules/orders/server/queries';
import { materialShortages, productionSummary } from '@/modules/production/server/queries';
import { callList } from '@/modules/sales/server/queries';
import { financeOverview } from '@/modules/finance/server/queries';
import { productionAlerts } from '@/modules/production/server/alerts';
import { AlertTriangle, CalendarClock, Clock, Layers } from 'lucide-react';
import { formatMoney as fm, money } from '@/core/money';
import { ChevronRight } from 'lucide-react';
import { NavIcon } from '@/ui/icon';
import { PageHeader } from '@/ui/page-header';
import { StatCard } from '@/ui/stat-card';

type Card = { label: string; value: string; href: string; icon: string; tone?: 'warn' };

const has = (roles: Role[], ...want: Role[]) => roles.some((r) => want.includes(r));

// Ana sayfa: açık modüllerin kullanıcının rolüne göre özet kartları, altında menü kısayolları.
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/giris');
  // Bölüm tabletleri doğrudan kendi ekranlarına gider.
  if (user.kind === 'device') redirect('/uretim/bolum');

  const cfg = (await getConfig());
  const office = has(user.roles, 'admin', 'sales', 'tracking');
  const [production, shortages, orders, today, overdue, finance, alerts] = await Promise.all([
    office && isModuleEnabled('production', cfg) ? productionSummary({}) : null,
    has(user.roles, 'admin', 'tracking') && isModuleEnabled('production', cfg) ? materialShortages({}) : null,
    office && isModuleEnabled('orders', cfg) ? ordersSummary({}) : null,
    has(user.roles, 'admin', 'sales') && isModuleEnabled('sales', cfg) ? callList({ view: 'today' }) : null,
    has(user.roles, 'admin', 'sales') && isModuleEnabled('sales', cfg) ? callList({ view: 'overdue' }) : null,
    has(user.roles, 'admin', 'accounting') && isModuleEnabled('finance', cfg) ? financeOverview({}) : null,
    office && isModuleEnabled('production', cfg) ? productionAlerts({}) : null,
  ]);

  const cards: Card[] = [];
  if (production?.ok) {
    const p = production.data;
    cards.push(
      { label: 'Kumaş bekleyen iş', value: String(p.waitingFabric), href: '/uretim?sekme=fabric', icon: 'layers', tone: p.waitingFabric ? 'warn' : undefined },
      { label: 'Üretimdeki iş', value: String(p.inProduction), href: '/uretim?sekme=production', icon: 'factory' },
      { label: 'Kontrol bekleyen', value: String(p.review), href: '/uretim?sekme=review', icon: 'shield', tone: p.review ? 'warn' : undefined },
      { label: 'Sevke hazır', value: String(p.readyToShip), href: '/uretim?sekme=ready', icon: 'truck' },
    );
  }
  if (shortages?.ok && shortages.data.length) cards.push({ label: 'Stok açığı (malzeme türü)', value: String(shortages.data.length), href: '/uretim/kumas', icon: 'layers', tone: 'warn' });
  if (orders?.ok) {
    const o = orders.data;
    cards.push(
      { label: 'Yeni sipariş', value: String(o.counts.draft ?? 0), href: '/siparisler?durum=draft', icon: 'clipboard-list' },
      { label: 'Faturaya hazır', value: String(o.counts.ready_to_invoice ?? 0), href: '/siparisler?durum=ready_to_invoice', icon: 'clipboard-list', tone: o.counts.ready_to_invoice ? 'warn' : undefined },
      { label: 'Açık sipariş bakiyesi', value: o.openBalances.length ? o.openBalances.map((m) => formatMoney(moneyFromJSON(m))).join(' · ') : '—', href: '/siparisler/alacaklar', icon: 'wallet' },
    );
  }
  if (today?.ok) cards.push({ label: 'Bugün aranacak', value: String(today.data.length), href: '/satis?gorunum=today', icon: 'phone' });
  if (overdue?.ok && overdue.data.length) cards.push({ label: 'Geciken arama', value: String(overdue.data.length), href: '/satis?gorunum=overdue', icon: 'phone', tone: 'warn' });

  if (finance?.ok) {
    const t = finance.data.totals;
    const join = (k: 'receivable' | 'overdueReceivable' | 'payable') => t.filter((x) => BigInt(x[k]) !== 0n).map((x) => fm(money(x[k], x.currency))).join(' · ') || fm(money(0n, 'TRY'));
    const overdue = t.some((x) => BigInt(x.overdueReceivable) > 0n);
    cards.push(
      { label: 'Cari alacak', value: join('receivable'), href: '/muhasebe/cariler', icon: 'banknote' },
      { label: 'Gecikmiş alacak', value: join('overdueReceivable'), href: '/muhasebe/cariler', icon: 'banknote', tone: overdue ? 'warn' : undefined },
      { label: 'Cari borç', value: join('payable'), href: '/muhasebe/cariler?yon=borc', icon: 'receipt' },
      { label: 'Kasa + banka', value: t.filter((x) => BigInt(x.cash) + BigInt(x.bank) !== 0n).map((x) => fm(money(BigInt(x.cash) + BigInt(x.bank), x.currency))).join(' · ') || fm(money(0n, 'TRY')), href: '/muhasebe/hesaplar', icon: 'landmark' },
    );
  }

  const links = navFor(user.roles, cfg).filter((n) => n.href !== '/');
  const hour = Number(new Intl.DateTimeFormat('tr-TR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }).format(new Date()));
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const dateText = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date());
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={dateText} title={<>Hoş geldiniz, {user.name}</>} description={`${greeting}. Günün özeti ve sık kullandığınız ekranlar aşağıda.`} />
      {cards.length > 0 && (
        <section aria-label="Özet" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} href={c.href} icon={c.icon} tone={c.tone} />
          ))}
        </section>
      )}
      {alerts?.ok && alerts.data.length > 0 && (
        <section aria-label="Uyarılar" className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-stone-500"><AlertTriangle aria-hidden className="h-4 w-4" /> Dikkat gerekenler <span className="rounded-full bg-stone-200 px-2 text-xs text-stone-700">{alerts.data.length}</span></h2>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
            {alerts.data.slice(0, 8).map((a) => {
              const Icon = a.kind === 'late' || a.kind === 'due_soon' ? CalendarClock : a.kind === 'fabric_wait' ? Layers : Clock;
              return (
                <li key={`${a.kind}-${a.href}`}>
                  <Link href={a.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-stone-50">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.severity === 'danger' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}><Icon aria-hidden className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-900">{a.title}</span>
                      <span className={`block text-sm ${a.severity === 'danger' ? 'text-red-700' : 'text-stone-600'}`}>{a.detail}</span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-stone-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {alerts.data.length > 8 && <p className="text-sm text-stone-500">ve {alerts.data.length - 8} uyarı daha — üretim panosundan takip edin.</p>}
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">Hızlı erişim</h2>
        <nav aria-label="Kısayollar" className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="group flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 font-medium sm:p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-stone-100 text-stone-600 transition group-hover:bg-[var(--brand-soft)] group-hover:text-[var(--brand-strong)]">
                <NavIcon name={l.icon} />
              </span>
              <span className="flex-1">{l.label}</span>
              <ChevronRight aria-hidden className="h-4 w-4 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-700" />
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
