import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDate, istanbulToday } from '@/core/dates';
import { shipmentHistory } from '@/modules/production/server/queries';
import { Truck } from 'lucide-react';
import { requireProductionPage } from '@/modules/production/ui/guard';
import { buttonClasses } from '@/ui/button';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { PageHeader } from '@/ui/page-header';

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
    <div className="space-y-5">
      <PageHeader
        title="Sevk geçmişi"
        description="Seçilen tarih aralığında yapılan sevkler. Sevk işlemi panonun “Faturaya Hazır” sekmesinden ve iş kartından yapılır."
        actions={<Link href="/uretim?sekme=ready" className={buttonClasses('secondary')}><Truck aria-hidden className="h-4 w-4" /> Sevke hazır işler</Link>}
      />
      <FilterBar>
        <FilterField label="Başlangıç"><input type="date" name="bas" defaultValue={from} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="bit" defaultValue={to} className={filterInputClass} /></FilterField>
        <button className={filterButtonClass}>Göster</button>
      </FilterBar>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sevk" value={r.data.length.toLocaleString('tr-TR')} />
        <Tile label="Toplam adet" value={total.toLocaleString('tr-TR')} brand />
        <Tile label="Müşteri" value={new Set(r.data.map((x) => x.partyName)).size.toLocaleString('tr-TR')} />
        <Tile label="İş" value={new Set(r.data.map((x) => x.jobId)).size.toLocaleString('tr-TR')} />
      </section>
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-3 font-semibold">Tarih</th><th className="px-4 py-3 font-semibold">İş</th><th className="px-4 py-3 font-semibold">Müşteri</th><th className="px-4 py-3 font-semibold">Ürün</th><th className="px-4 py-3 font-semibold text-right">Adet</th><th className="px-4 py-3 font-semibold">Not</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.map((s) => (
              <tr key={s.id} className="hover:bg-stone-50/70">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-stone-600">{formatDate(s.shippedAt)}</td>
                <td className="px-4 py-3"><Link href={`/uretim/is/${s.jobId}`} className="whitespace-nowrap font-mono text-xs font-medium text-stone-700 underline-offset-2 hover:underline">{s.jobNo}</Link></td>
                <td className="px-4 py-3 font-medium text-stone-900">{s.partyName}</td>
                <td className="px-4 py-3 text-stone-600">{s.product}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{s.qty.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-stone-600">{s.note}</td>
              </tr>
            ))}
            {!r.data.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-stone-500">Bu aralıkta sevk yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, brand }: { label: string; value: string; brand?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] ${brand ? 'border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)]' : 'border-stone-200/80 bg-white'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
