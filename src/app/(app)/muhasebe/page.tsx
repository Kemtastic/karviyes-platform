import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, Landmark, ScrollText, Wallet } from 'lucide-react';
import { formatDate, istanbulToday } from '@/core/dates';
import { formatMoney, money, type Currency } from '@/core/money';
import { accountOptions, financeOverview, periodLock, vatSummary } from '@/modules/finance/server/queries';
import { PeriodLockCard } from '@/modules/finance/ui/period-lock';
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

export default async function FinanceHomePage({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  await requireFinancePage();
  const { ay } = await searchParams;
  const month = ay && /^\d{4}-\d{2}$/.test(ay) ? ay : istanbulToday().slice(0, 7);
  const [r, accounts, vat, lock] = await Promise.all([financeOverview({}), accountOptions({}), vatSummary({ month }), periodLock({})]);
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
          </section>
        ))
      ) : (
        <EmptyState title="Henüz muhasebe kaydı yok." hint="Fatura kaydı, tahsilat ya da ödeme girdikçe özet burada oluşur." />
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card
          title="KDV özeti"
          description="Fatura kayıtları ve belgeli masraflardan; bilgi amaçlıdır, beyan mali müşavirce hazırlanır."
          actions={
            <form className="flex items-center gap-2">
              <input type="month" name="ay" defaultValue={month} aria-label="Ay" className="min-h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm" />
              <button className="min-h-9 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white">Göster</button>
            </form>
          }
        >
          {vat.ok && vat.data.rows.length ? (
            <div className="space-y-4">
              {vat.data.rows.map((v) => (
                <dl key={v.currency} className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  <Vat label="Hesaplanan KDV" value={m(v.output, v.currency)} sub={`matrah ${m(v.salesBase, v.currency)}`} />
                  <Vat label="İndirilecek KDV" value={m(v.deductible, v.currency)} sub={`alış ${m(v.purchaseVat, v.currency)} + masraf ${m(v.expenseVat, v.currency)}`} />
                  <Vat label={BigInt(v.difference) >= 0n ? 'Ödenecek (fark)' : 'Devreden (fark)'} value={m(v.difference.replace('-', ''), v.currency)} strong />
                  {v.responsible !== '0' && <Vat label="Sorumlu sıfatıyla (2 No'lu)" value={m(v.responsible, v.currency)} sub="tevkifatlı alışlar" />}
                  {v.salesWithholding !== '0' && <Vat label="Satışta tevkif edilen" value={m(v.salesWithholding, v.currency)} sub="alıcı beyan eder" />}
                  {v.byRate.length > 0 && (
                    <div className="col-span-full overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-stone-500"><tr><th className="py-1 text-left font-medium">Oran</th><th className="py-1 text-right font-medium">Satış matrahı</th><th className="py-1 text-right font-medium">Hesaplanan</th><th className="py-1 text-right font-medium">Alış matrahı</th><th className="py-1 text-right font-medium">İndirilecek</th></tr></thead>
                        <tbody className="divide-y divide-stone-100">
                          {[...new Set(v.byRate.map((x) => x.rate))].sort((a, b) => Number(b) - Number(a)).map((rate) => {
                            const s = v.byRate.find((x) => x.side === 'sales' && x.rate === rate);
                            const p = v.byRate.find((x) => x.side === 'purchase' && x.rate === rate);
                            return (
                              <tr key={rate}>
                                <td className="py-1">%{rate}</td>
                                <td className="py-1 text-right tabular-nums">{s ? m(s.base, v.currency) : '—'}</td>
                                <td className="py-1 text-right tabular-nums">{s ? m(s.vat, v.currency) : '—'}</td>
                                <td className="py-1 text-right tabular-nums">{p ? m(p.base, v.currency) : '—'}</td>
                                <td className="py-1 text-right tabular-nums">{p ? m(p.vat, v.currency) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </dl>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">Bu ay için fatura ya da masraf kaydı yok.</p>
          )}
        </Card>
        <PeriodLockCard lockedUntil={lock.ok ? lock.data.lockedUntil : null} />
      </div>
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

function Vat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</dd>
      {sub && <dd className="text-xs text-stone-500">{sub}</dd>}
    </div>
  );
}
