import { notFound } from 'next/navigation';
import { formatDate, istanbulToday } from '@/core/dates';
import { cashForecast, incomeExpense } from '@/modules/finance/server/analysis';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { PageHeader } from '@/ui/page-header';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const H2 = 'text-[15px] font-semibold text-stone-900';
const TH = 'px-4 py-3 font-semibold';
// "12.345,67 ₺" → sayı (yalnız çubuk boyu için).
const num = (s: string) => Number(s.replace(/[^\d,−-]/g, '').replace(',', '.').replace('−', '-'));

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<{ bas?: string; bit?: string }> }) {
  await requireFinancePage();
  const today = istanbulToday();
  const q = await searchParams;
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const from = valid(q.bas) ?? `${today.slice(0, 4)}-01-01`;
  const to = valid(q.bit) ?? today;
  const [ie, cf] = await Promise.all([incomeExpense({ from, to }), cashForecast({})]);
  if (!ie.ok || !cf.ok) notFound();
  const max = Math.max(1, ...cf.data.weeks.map((w) => Math.abs(num(w.balance))));
  return (
    <div className="space-y-6">
      <PageHeader title="Raporlar" description="Gelir-gider (fatura ve masraf tarihine göre, KDV hariç) ve önümüzdeki haftaların nakit akış tahmini. Yalnız TL kayıtlar; döviz faturalar ve hesaplar dahil değildir." />

      <section className="space-y-3">
        <h2 className={H2}>Gelir – gider</h2>
        <FilterBar>
          <FilterField label="Başlangıç"><input type="date" name="bas" defaultValue={from} className={filterInputClass} /></FilterField>
          <FilterField label="Bitiş"><input type="date" name="bit" defaultValue={to} className={filterInputClass} /></FilterField>
          <button className={filterButtonClass}>Göster</button>
        </FilterBar>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr><th className={TH}>Ay</th><th className={`${TH} text-right`}>Satış</th><th className={`${TH} text-right`}>Alış</th><th className={`${TH} text-right`}>Masraf</th><th className={`${TH} text-right`}>Diğer gelir</th><th className={`${TH} text-right`}>Sonuç</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {ie.data.months.map((m) => (
                <tr key={m.month}>
                  <td className="px-4 py-2.5">{monthName(m.month)}</td>
                  <td className="px-4 py-2.5 text-right">{m.revenue}</td><td className="px-4 py-2.5 text-right">{m.purchases}</td><td className="px-4 py-2.5 text-right">{m.expenses}</td><td className="px-4 py-2.5 text-right">{m.otherIncome}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${m.positive ? 'text-emerald-700' : 'text-red-700'}`}>{m.result}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-stone-200 bg-stone-50/80 font-semibold tabular-nums">
              <tr><td className="px-4 py-3">Toplam</td><td className="px-4 py-3 text-right">{ie.data.total.revenue}</td><td className="px-4 py-3 text-right">{ie.data.total.purchases}</td><td className="px-4 py-3 text-right">{ie.data.total.expenses}</td><td className="px-4 py-3 text-right">{ie.data.total.otherIncome}</td><td className="px-4 py-3 text-right">{ie.data.total.result}</td></tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-stone-500">Sonuç = satış + diğer gelir − alış − masraf. Stok değişimi ve amortisman dikkate alınmaz; resmî kâr/zarar mali müşavirin hesabıdır.</p>
        {ie.data.expenseByCategory.length > 0 && (
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-sm font-semibold text-stone-800">Masraf kırılımı</h3>
            <ul className="space-y-2 text-sm">
              {ie.data.expenseByCategory.map((c) => (
                <li key={c.category} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
                  <span className="truncate">{c.category}</span>
                  <span className="h-2.5 rounded-full bg-stone-100"><span className="block h-2.5 rounded-full bg-[var(--brand)]" style={{ width: `${c.share}%` }} /></span>
                  <span className="tabular-nums">{c.amount} <span className="text-stone-500">%{c.share}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className={H2}>Nakit akış tahmini (haftalık)</h2>
        <p className="text-sm text-stone-600">
          Bugünkü kasa + banka: <b className="tabular-nums">{cf.data.start}</b>. Vadeli alacak/borçlar, çekler ve işlenmemiş tekrarlayan kayıtlar vade haftasına yazılır.
          {(cf.data.overdueIn !== '0,00 ₺' || cf.data.overdueOut !== '0,00 ₺') && <> Vadesi geçmiş kalemler ilk haftada: tahsil {cf.data.overdueIn}, ödeme {cf.data.overdueOut}.</>}
        </p>
        {cf.data.lowest.negative && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><b>{formatDate(cf.data.lowest.from)}</b> haftasında nakit eksiye düşüyor ({cf.data.lowest.balance}).</p>}
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr><th className={TH}>Hafta</th><th className={`${TH} text-right`}>Giriş</th><th className={`${TH} text-right`}>Çıkış</th><th className={`${TH} text-right`}>Hafta sonu</th><th className={`${TH} w-1/3`} /></tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {cf.data.weeks.map((w) => (
                <tr key={w.from}>
                  <td className="whitespace-nowrap px-4 py-2">{formatDate(w.from)}</td>
                  <td className="px-4 py-2 text-right text-emerald-700">{w.inflow}</td>
                  <td className="px-4 py-2 text-right text-red-700">{w.outflow}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${w.negative ? 'text-red-700' : ''}`}>{w.balance}</td>
                  <td className="px-4 py-2"><span className="block h-2.5 rounded-full bg-stone-100"><span className={`block h-2.5 rounded-full ${w.negative ? 'bg-red-500' : 'bg-[var(--brand)]'}`} style={{ width: `${Math.round((Math.abs(num(w.balance)) / max) * 100)}%` }} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
