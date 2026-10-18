import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { getInstallConfig } from '@/core/install-config';
import { machineStaffReport, type ReportRow } from '@/modules/production/server/reports';
import { requireProductionPage } from '@/modules/production/ui/guard';
import { stageLabel } from '@/modules/production/ui/labels';
import { fieldClass } from '@/ui/form-field';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireProductionPage(['admin', 'tracking']);
  const sp = await searchParams;
  const today = istanbulToday();
  const from = sp.from ?? `${today.slice(0, 8)}01`;
  const to = sp.to ?? today;
  const r = await machineStaffReport({ from, to });
  if (!r.ok) notFound();
  const sector = getInstallConfig().sector;

  const table = (title: string, rows: ReportRow[]) => (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th className="px-3 py-2 text-left">Ad</th><th className="px-3 py-2 text-left">Aşama</th><th className="px-3 py-2 text-right">İş</th>
              <th className="px-3 py-2 text-right">Sağlam</th><th className="px-3 py-2 text-right">Kesim firesi</th><th className="px-3 py-2 text-right">Baskı firesi (m)</th><th className="px-3 py-2 text-right">Fire oranı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((x) => (
              <tr key={`${x.key}-${x.stage}`}>
                <td className="px-3 py-2">{x.key}</td>
                <td className="px-3 py-2">{stageLabel(sector, x.stage)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.jobs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.good.toLocaleString('tr-TR')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.cutWaste.toLocaleString('tr-TR')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.printWaste.toLocaleString('tr-TR')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.good + x.cutWaste > 0 && x.stage !== 'printing' ? `%${((x.cutWaste / (x.good + x.cutWaste)) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-stone-500">Bu aralıkta bitirilen aşama yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Makine ve personel raporu</h1>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <label className="text-sm font-medium">Başlangıç<input type="date" name="from" defaultValue={from} className={fieldClass} /></label>
        <label className="text-sm font-medium">Bitiş<input type="date" name="to" defaultValue={to} className={fieldClass} /></label>
        <button className="min-h-11 rounded-lg bg-stone-900 px-4 font-semibold text-white">Göster</button>
      </form>
      <p className="text-sm text-stone-600">Fire, aşamanın kendi makinesine ve personeline yazılır: baskı firesi baskıya, kesim firesi kesim ve bitiş aşamalarına.</p>
      {table('Makineler', r.data.byMachine)}
      {table('Personel', r.data.byStaff)}
    </div>
  );
}
