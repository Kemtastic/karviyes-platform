import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, Landmark, ScrollText, Wallet } from 'lucide-react';
import { formatDate } from '@/core/dates';
import { formatMoney, money, type Currency } from '@/core/money';
import { accountOptions, financeOverview } from '@/modules/finance/server/queries';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { FinanceToolbar } from '@/modules/finance/ui/toolbar';
import { Badge } from '@/ui/badge';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { PageHeader } from '@/ui/page-header';

const EVENT: Record<string, { label: string; tone: 'success' | 'warning' | 'info' | 'brand' }> = {
  receivable: { label: 'Tahsil edilecek', tone: 'success' },
  payable: { label: 'Ödenecek', tone: 'warning' },
  check_in: { label: 'Müşteri çeki', tone: 'info' },
  check_out: { label: 'Verilen çek', tone: 'brand' },
};

export default async function FinanceHomePage() {
  await requireFinancePage();
  const [r, accounts] = await Promise.all([financeOverview({}), accountOptions({})]);
  if (!r.ok) notFound();
  const o = r.data;
  const m = (v: string, c: Currency) => formatMoney(money(v, c));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ön muhasebe"
        title="Muhasebe özeti"
        description="Alacaklar, borçlar, kasa ve banka, çekler ve önümüzdeki 30 günün ödeme takvimi."
        actions={<FinanceToolbar actions={['collection', 'payment', 'sales', 'expense']} accounts={accounts.ok ? accounts.data : []} />}
      />
      {!o.accounts && (
        <p className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle aria-hidden className="h-4 w-4" /> Tahsilat ve ödeme için önce <Link href="/muhasebe/hesaplar" className="font-semibold underline">kasa veya banka hesabı açın</Link>.
        </p>
      )}
      {o.totals.length ? (
        o.totals.map((t) => (
          <section key={t.currency} aria-label={`${t.currency} özeti`} className="space-y-3">
            {o.totals.length > 1 && <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">{t.currency}</h2>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile icon={<ArrowDownLeft className="h-5 w-5" />} label="Alacak" value={m(t.receivable, t.currency)} sub={BigInt(t.overdueReceivable) > 0n ? `${m(t.overdueReceivable, t.currency)} gecikmiş` : 'Gecikmiş yok'} warn={BigInt(t.overdueReceivable) > 0n} href="/muhasebe/cariler" />
              <Tile icon={<ArrowUpRight className="h-5 w-5" />} label="Borç" value={m(t.payable, t.currency)} sub={BigInt(t.overduePayable) > 0n ? `${m(t.overduePayable, t.currency)} gecikmiş` : 'Gecikmiş yok'} warn={BigInt(t.overduePayable) > 0n} href="/muhasebe/cariler?yon=borc" />
              <Tile icon={<Wallet className="h-5 w-5" />} label="Kasa + banka" value={m((BigInt(t.cash) + BigInt(t.bank)).toString(), t.currency)} sub={`Kasa ${m(t.cash, t.currency)}`} href="/muhasebe/hesaplar" />
              <Tile icon={<ScrollText className="h-5 w-5" />} label="Portföydeki çek" value={m(t.checksIn, t.currency)} sub={BigInt(t.checksOut) > 0n ? `Verilen ${m(t.checksOut, t.currency)}` : 'Verilen çek yok'} href="/muhasebe/cekler" />
            </div>
            <p className="text-sm text-stone-600">
              Bu ay KDV: hesaplanan <strong className="tabular-nums">{m(t.vatOut, t.currency)}</strong> · indirilecek <strong className="tabular-nums">{m(t.vatIn, t.currency)}</strong> · fark{' '}
              <strong className="tabular-nums">{m((BigInt(t.vatOut) - BigInt(t.vatIn)).toString(), t.currency)}</strong> <span className="text-stone-400">(fatura kayıtlarından, tevkifat düşülmüş; beyan için mali müşavir kontrolü gerekir)</span>
            </p>
          </section>
        ))
      ) : (
        <EmptyState title="Henüz muhasebe kaydı yok." hint="Fatura kaydı, tahsilat ya da ödeme girdikçe özet burada oluşur." />
      )}
      <Card title={<span className="inline-flex items-center gap-2"><CalendarClock aria-hidden className="h-4 w-4 text-stone-400" />Ödeme takvimi</span>} description={`${formatDate(o.today)} – ${formatDate(o.until)} arası vadeler ve gecikmişler`} padded={false}>
        {o.calendar.length ? (
          <ul className="divide-y divide-stone-100">
            {o.calendar.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`w-24 shrink-0 text-sm tabular-nums ${e.overdue ? 'font-semibold text-red-700' : 'text-stone-600'}`}>{formatDate(e.date)}</span>
                  <span className="min-w-0">
                    <Link href={`/muhasebe/cariler/${e.partyId}`} className="block truncate font-medium text-stone-900 hover:underline">{e.partyName}</Link>
                    <span className="block truncate text-xs text-stone-500">{e.text}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {e.overdue && <Badge tone="danger">gecikmiş</Badge>}
                  <Badge tone={EVENT[e.kind]!.tone} dot={false}>{EVENT[e.kind]!.label}</Badge>
                  <span className="w-32 text-right font-semibold tabular-nums">{m(e.amount, e.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-stone-500">Önümüzdeki 30 günde vadesi gelen kalem yok.</p>
        )}
      </Card>
      <p className="flex items-center gap-2 text-xs text-stone-500"><Landmark aria-hidden className="h-4 w-4" />Bakiyeler fatura kayıtları, tahsilat/ödemeler ve çeklerden hesaplanır; sipariş bakiyesinden bağımsızdır.</p>
    </div>
  );
}

function Tile({ icon, label, value, sub, warn, href }: { icon: React.ReactNode; label: string; value: string; sub: string; warn?: boolean; href: string }) {
  return (
    <Link href={href} className={`group rounded-2xl border p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-md ${warn ? 'border-amber-200 bg-amber-50' : 'border-stone-200/80 bg-white'}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${warn ? 'bg-amber-100 text-amber-800' : 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'}`}>{icon}</span>
      <span className="mt-3 block text-xs font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <span className="mt-0.5 block break-words text-xl font-semibold tabular-nums tracking-tight text-stone-900">{value}</span>
      <span className={`mt-1 block text-xs ${warn ? 'font-medium text-amber-800' : 'text-stone-500'}`}>{sub}</span>
    </Link>
  );
}
