import Link from 'next/link';
import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { formatMoney, money, type Currency } from '@/core/money';
import { productionInsights } from '@/modules/production/server/insights';
import { requireProductionPage } from '@/modules/production/ui/guard';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { PageHeader } from '@/ui/page-header';

const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
const n = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ bas?: string; bit?: string }> }) {
  await requireProductionPage(['admin', 'tracking', 'accounting']);
  const sp = await searchParams;
  const today = istanbulToday();
  const from = isDate(sp.bas) ? sp.bas! : `${today.slice(0, 4)}-01-01`;
  const to = isDate(sp.bit) ? sp.bit! : today;
  const r = await productionInsights({ from, to });
  if (!r.ok) notFound();
  const { rolls, stock, specs, goodDone } = r.data;
  const fm = (v: string, c: Currency) => formatMoney(money(v, c));
  const stockTotals = new Map<Currency, bigint>();
  for (const s of stock) stockTotals.set(s.currency, (stockTotals.get(s.currency) ?? 0n) + BigInt(s.value));
  const totalRolls = rolls.pending + rolls.production + rolls.done;
  return (
    <div className="space-y-5">
      <PageHeader title="Üretim içgörüleri" description="Seçilen sipariş tarihleri için bobin durumu ve ölçü başına satış; sevk bekleyen mamul bugünkü durumdur. Tutarlar KDV, klişe ve nakliye hariçtir." />
      <FilterBar>
        <FilterField label="Başlangıç"><input type="date" name="bas" defaultValue={from} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="bit" defaultValue={to} className={filterInputClass} /></FilterField>
        <button className={filterButtonClass}>Göster</button>
      </FilterBar>
      <section aria-label="Bobin durumu" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Toplam bobin" value={n(totalRolls)} />
        <Tile label="Üretime başlanmamış" value={n(rolls.pending)} bar={totalRolls ? rolls.pending / totalRolls : 0} />
        <Tile label="Üretimde" value={n(rolls.production)} bar={totalRolls ? rolls.production / totalRolls : 0} />
        <Tile label="Tamamlanan" value={n(rolls.done)} sub={`${goodDone.toLocaleString('tr-TR')} sağlam adet`} bar={totalRolls ? rolls.done / totalRolls : 0} brand />
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-stone-900">Ölçü başına satış</h2>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-4 py-3 text-left font-semibold">Ürün</th><th className="px-4 py-3 text-right font-semibold">Sipariş satırı</th><th className="px-4 py-3 text-right font-semibold">Adet</th><th className="px-4 py-3 text-right font-semibold">Bobin</th><th className="px-4 py-3 text-right font-semibold">Satış</th><th className="px-4 py-3 text-right font-semibold">Bobin başı satış</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {specs.map((s) => (
                <tr key={`${s.currency}-${s.key}`} className="hover:bg-stone-50/70">
                  <td className="px-4 py-3 font-medium text-stone-900">{s.key}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.lines}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.quantity.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{n(s.rolls)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{fm(s.sales, s.currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.perRoll ? fm(s.perRoll, s.currency) : '—'}</td>
                </tr>
              ))}
              {!specs.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-500">Bu aralıkta sipariş yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="flex flex-wrap items-baseline gap-2 text-[15px] font-semibold text-stone-900">
          Sevk bekleyen mamul
          {[...stockTotals].map(([c, v]) => <span key={c} className="rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-strong)]">{formatMoney(money(v, c))}</span>)}
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-4 py-3 text-left font-semibold">İş</th><th className="px-4 py-3 text-left font-semibold">Müşteri</th><th className="px-4 py-3 text-left font-semibold">Ürün</th><th className="px-4 py-3 text-right font-semibold">Adet</th><th className="px-4 py-3 text-right font-semibold">Satış değeri</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {stock.map((s) => (
                <tr key={s.jobId} className="hover:bg-stone-50/70">
                  <td className="px-4 py-3"><Link href={`/uretim/is/${s.jobId}`} className="whitespace-nowrap font-mono text-xs font-medium text-stone-700 hover:underline">{s.jobNo}</Link></td>
                  <td className="px-4 py-3 font-medium text-stone-900">{s.partyName}</td>
                  <td className="px-4 py-3 text-stone-600">{s.product}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.qty.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{fm(s.value, s.currency)}</td>
                </tr>
              ))}
              {!stock.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">Sevk bekleyen mamul yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, sub, bar, brand }: { label: string; value: string; sub?: string; bar?: number; brand?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] ${brand ? 'border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)]' : 'border-stone-200/80 bg-white'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
      {bar !== undefined && (
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-stone-100">
          <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.round(bar * 100)}%` }} />
        </span>
      )}
    </div>
  );
}
