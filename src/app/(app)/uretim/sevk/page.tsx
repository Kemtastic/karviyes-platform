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
        <h1 className="text-2xl font-semibold">Sevk geçmişi</h1>
        <Link href="/uretim?sekme=ready" className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">Sevke hazır işler</Link>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-sm">Başlangıç<input type="date" name="bas" defaultValue={from} className="min-h-11 rounded-lg border border-stone-300 px-3" /></label>
        <label className="flex flex-col text-sm">Bitiş<input type="date" name="bit" defaultValue={to} className="min-h-11 rounded-lg border border-stone-300 px-3" /></label>
        <button className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">Göster</button>
      </form>
      <p className="text-stone-700">{r.data.length} sevk · toplam <strong className="tabular-nums">{total.toLocaleString('tr-TR')}</strong> adet</p>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-stone-600">
            <tr><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">İş</th><th className="px-3 py-2">Müşteri</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2 text-right">Adet</th><th className="px-3 py-2">Not</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(s.shippedAt)}</td>
                <td className="px-3 py-2 font-mono"><Link href={`/uretim/is/${s.jobId}`} className="underline">{s.jobNo}</Link></td>
                <td className="px-3 py-2">{s.partyName}</td>
                <td className="px-3 py-2 text-stone-600">{s.product}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.qty.toLocaleString('tr-TR')}</td>
                <td className="px-3 py-2 text-stone-600">{s.note}</td>
              </tr>
            ))}
            {!r.data.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-stone-500">Bu aralıkta sevk yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
