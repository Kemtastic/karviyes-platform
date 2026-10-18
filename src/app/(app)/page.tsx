import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { formatMoney, moneyFromJSON } from '@/core/money';
import { isModuleEnabled } from '@/core/modules/registry';
import type { Role } from '@/core/modules/types';
import { navFor } from '@/core/nav';
import { ordersSummary } from '@/modules/orders/server/queries';
import { materialShortages, productionSummary } from '@/modules/production/server/queries';
import { callList } from '@/modules/sales/server/queries';

type Card = { label: string; value: string; href: string; tone?: 'warn' };

const has = (roles: Role[], ...want: Role[]) => roles.some((r) => want.includes(r));

// Ana sayfa: açık modüllerin kullanıcının rolüne göre özet kartları, altında menü kısayolları.
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/giris');
  // Bölüm tabletleri doğrudan kendi ekranlarına gider.
  if (user.kind === 'device') redirect('/uretim/bolum');

  const cfg = getInstallConfig();
  const office = has(user.roles, 'admin', 'sales', 'tracking');
  const [production, shortages, orders, today, overdue] = await Promise.all([
    office && isModuleEnabled('production', cfg) ? productionSummary({}) : null,
    has(user.roles, 'admin', 'tracking') && isModuleEnabled('production', cfg) ? materialShortages({}) : null,
    office && isModuleEnabled('orders', cfg) ? ordersSummary({}) : null,
    has(user.roles, 'admin', 'sales') && isModuleEnabled('sales', cfg) ? callList({ view: 'today' }) : null,
    has(user.roles, 'admin', 'sales') && isModuleEnabled('sales', cfg) ? callList({ view: 'overdue' }) : null,
  ]);

  const cards: Card[] = [];
  if (production?.ok) {
    const p = production.data;
    cards.push(
      { label: 'Kumaş bekleyen iş', value: String(p.waitingFabric), href: '/uretim?sekme=fabric', tone: p.waitingFabric ? 'warn' : undefined },
      { label: 'Üretimdeki iş', value: String(p.inProduction), href: '/uretim?sekme=production' },
      { label: 'Kontrol bekleyen', value: String(p.review), href: '/uretim?sekme=review', tone: p.review ? 'warn' : undefined },
      { label: 'Sevke hazır', value: String(p.readyToShip), href: '/uretim?sekme=ready' },
    );
  }
  if (shortages?.ok && shortages.data.length) cards.push({ label: 'Stok açığı (malzeme türü)', value: String(shortages.data.length), href: '/uretim/kumas', tone: 'warn' });
  if (orders?.ok) {
    const o = orders.data;
    cards.push(
      { label: 'Yeni sipariş', value: String(o.counts.draft ?? 0), href: '/siparisler?durum=draft' },
      { label: 'Faturaya hazır', value: String(o.counts.ready_to_invoice ?? 0), href: '/siparisler?durum=ready_to_invoice', tone: o.counts.ready_to_invoice ? 'warn' : undefined },
      { label: 'Açık sipariş bakiyesi', value: o.openBalances.length ? o.openBalances.map((m) => formatMoney(moneyFromJSON(m))).join(' · ') : '—', href: '/siparisler/alacaklar' },
    );
  }
  if (today?.ok) cards.push({ label: 'Bugün aranacak', value: String(today.data.length), href: '/satis?gorunum=today' });
  if (overdue?.ok && overdue.data.length) cards.push({ label: 'Geciken arama', value: String(overdue.data.length), href: '/satis?gorunum=overdue', tone: 'warn' });

  const links = navFor(user.roles, cfg).filter((n) => n.href !== '/');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hoş geldiniz, {user.name}</h1>
      {cards.length > 0 && (
        <section aria-label="Özet" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Link key={c.label} href={c.href} className={`rounded-xl border bg-white p-4 shadow-sm hover:border-[var(--brand)] ${c.tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
              <span className="block text-sm text-stone-600">{c.label}</span>
              <span className="block text-2xl font-semibold tabular-nums">{c.value}</span>
            </Link>
          ))}
        </section>
      )}
      <nav aria-label="Kısayollar" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border border-stone-200 bg-white p-5 font-medium shadow-sm hover:border-[var(--brand)]">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
