import Link from 'next/link';
import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { getInstallConfig } from '@/core/install-config';
import { machineStaffReport, type ReportRow } from '@/modules/production/server/reports';
import { requireProductionPage } from '@/modules/production/ui/guard';
import { stageLabel, stageTone } from '@/modules/production/ui/labels';
import { Badge } from '@/ui/badge';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { PageHeader } from '@/ui/page-header';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireProductionPage(['admin', 'tracking']);
  const sp = await searchParams;
  const today = istanbulToday();
  const from = sp.from ?? `${today.slice(0, 8)}01`;
  const to = sp.to ?? today;
  const r = await machineStaffReport({ from, to });
  if (!r.ok) notFound();
  const sector = getInstallConfig().sector;
  const totalGood = r.data.byJob.reduce((s, j) => s + j.good, 0);
  const totalCut = r.data.byJob.reduce((s, j) => s + j.cutWaste, 0);
  const totalPrint = r.data.byJob.reduce((s, j) => s + j.printWaste, 0);
  // Kg ile izlenen sektörde (plastik) fire kg sütunu gösterilir.
  const showKg = [...r.data.byMachine, ...r.data.byStaff].some((x) => x.wasteKg > 0) || r.data.byJob.some((j) => j.wasteKg > 0);

  const table = (title: string, rows: ReportRow[]) => (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">{title}<span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">{rows.length}</span></h2>
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 font-semibold text-left">Ad</th><th className="px-4 py-3 font-semibold text-left">Aşama</th><th className="px-4 py-3 font-semibold text-right">İş</th>
              <th className="px-4 py-3 font-semibold text-right">Sağlam</th><th className="px-4 py-3 font-semibold text-right">Kesim firesi</th><th className="px-4 py-3 font-semibold text-right">Baskı firesi (m)</th>{showKg && <th className="px-4 py-3 font-semibold text-right">Fire (kg)</th>}<th className="px-4 py-3 font-semibold text-right">Fire oranı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((x) => (
              <tr key={`${x.key}-${x.stage}`} className="hover:bg-stone-50/70">
                <td className="px-4 py-3 font-medium text-stone-900">{x.key}</td>
                <td className="px-4 py-3"><Badge tone={stageTone(x.stage)} dot={false}>{stageLabel(sector, x.stage)}</Badge></td>
                <td className="px-4 py-3 text-right tabular-nums">{x.jobs}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.good.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.cutWaste.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.printWaste.toLocaleString('tr-TR')}</td>
                {showKg && <td className="px-4 py-3 text-right tabular-nums">{x.wasteKg.toLocaleString('tr-TR')}</td>}
                <td className="px-4 py-3 text-right tabular-nums">{x.good + x.cutWaste > 0 && x.stage !== 'printing' ? <WasteRate value={(x.cutWaste / (x.good + x.cutWaste)) * 100} /> : <span className="text-stone-400">—</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={showKg ? 8 : 7} className="px-3 py-10 text-center text-stone-500">Bu aralıkta bitirilen aşama yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Makine, personel ve iş raporu"
        description="Fire, aşamanın kendi makinesine ve personeline yazılır: baskı firesi baskıya, kesim firesi kesim ve bitiş aşamalarına."
      />
      <FilterBar>
        <FilterField label="Başlangıç"><input type="date" name="from" defaultValue={from} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="to" defaultValue={to} className={filterInputClass} /></FilterField>
        <button className={filterButtonClass}>Göster</button>
      </FilterBar>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Biten iş" value={r.data.byJob.length.toLocaleString('tr-TR')} />
        <Tile label="Sağlam ürün" value={totalGood.toLocaleString('tr-TR')} brand />
        <Tile label="Kesim firesi" value={totalCut.toLocaleString('tr-TR')} />
        <Tile label="Baskı firesi (m)" value={totalPrint.toLocaleString('tr-TR')} />
      </section>
      {table('Makineler', r.data.byMachine)}
      {table('Personel', r.data.byStaff)}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">İşler<span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">{r.data.byJob.length}</span></h2>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold text-left">İş</th><th className="px-4 py-3 font-semibold text-left">Müşteri</th><th className="px-4 py-3 font-semibold text-right">Hedef</th>
                <th className="px-4 py-3 font-semibold text-right">Sağlam</th><th className="px-4 py-3 font-semibold text-right">Kesim firesi</th><th className="px-4 py-3 font-semibold text-right">Baskı firesi (m)</th>{showKg && <th className="px-4 py-3 font-semibold text-right">Fire (kg)</th>}<th className="px-4 py-3 font-semibold text-right">Fire oranı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {r.data.byJob.map((j) => (
                <tr key={j.jobId} className="hover:bg-stone-50/70">
                  <td className="px-4 py-3"><Link href={`/uretim/is/${j.jobId}`} className="whitespace-nowrap font-mono text-xs font-medium text-stone-700 underline-offset-2 hover:underline">{j.jobNo}</Link></td>
                  <td className="px-4 py-3 font-medium text-stone-900">{j.partyName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.target.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.good.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.cutWaste.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.printWaste.toLocaleString('tr-TR')}</td>
                  {showKg && <td className="px-4 py-3 text-right tabular-nums">{j.wasteKg.toLocaleString('tr-TR')}</td>}
                  <td className="px-4 py-3 text-right tabular-nums"><WasteRate value={Number(j.wasteRate)} /></td>
                </tr>
              ))}
              {!r.data.byJob.length && <tr><td colSpan={showKg ? 8 : 7} className="px-3 py-10 text-center text-stone-500">Bu aralıkta bitirilen aşama yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
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

// Fire oranı: %5 üstü amber, %10 üstü kırmızı.
function WasteRate({ value }: { value: number }) {
  const tone = value > 10 ? 'bg-red-50 text-red-700' : value > 5 ? 'bg-amber-50 text-amber-800' : 'text-stone-700';
  return <span className={`rounded-md px-1.5 py-0.5 ${tone}`}>%{value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span>;
}
