import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDate, istanbulToday } from '@/core/dates';
import { shipmentHistory } from '@/modules/production/server/queries';
import { requireProductionPage } from '@/modules/production/ui/guard';

const isDate = (v: string | undefined) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

// Sevk geçmişi. Sevk işlemi panonun "Faturaya Hazır" sekmesinden ve iş kartından yapılır.
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ bas?: string; bit?: string }> }) {
  await requireProductionPage(['admin', 'tracking', 'sales']);
  const sp = await searchParams;
  const today = istanbulToday();
  const from = isDate(sp.bas) ? sp.bas! : `${today.slice(0, 7)}-01`;
  const to = isDate(sp.bit) ? sp.bit! : today;
  const r = await shipmentHistory({ from, to });
  if (!r.ok) notFound();
  const total = r.data.reduce((s, x) => s + x.qty, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Sevk geçmişi</h1>
        <Link href="/uretim?sekme=ready" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition-colors hover:border-stone-400 hover:bg-stone-50">Sevke hazır işler</Link>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-sm">Başlangıç<input type="date" name="bas" defaultValue={from} className="mt-1 min-h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm shadow-sm focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[var(--brand-soft)]" /></label>
        <label className="flex flex-col text-sm">Bitiş<input type="date" name="bit" defaultValue={to} className="mt-1 min-h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm shadow-sm focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[var(--brand-soft)]" /></label>
        <button className="min-h-10 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-stone-800">Göster</button>
      </form>
      <p className="text-stone-700">{r.data.length} sevk · toplam <strong className="tabular-nums">{total.toLocaleString('tr-TR')}</strong> adet</p>
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-3 font-semibold">Tarih</th><th className="px-4 py-3 font-semibold">İş</th><th className="px-4 py-3 font-semibold">Müşteri</th><th className="px-4 py-3 font-semibold">Ürün</th><th className="px-4 py-3 font-semibold text-right">Adet</th><th className="px-4 py-3 font-semibold">Not</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(s.shippedAt)}</td>
                <td className="px-4 py-3 font-mono"><Link href={`/uretim/is/${s.jobId}`} className="underline">{s.jobNo}</Link></td>
                <td className="px-4 py-3">{s.partyName}</td>
                <td className="px-4 py-3 text-stone-600">{s.product}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.qty.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-stone-600">{s.note}</td>
              </tr>
            ))}
            {!r.data.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-stone-500">Bu aralıkta sevk yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
