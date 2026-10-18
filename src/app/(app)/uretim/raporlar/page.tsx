import Link from 'next/link';
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
      <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 font-semibold text-left">Ad</th><th className="px-4 py-3 font-semibold text-left">Aşama</th><th className="px-4 py-3 font-semibold text-right">İş</th>
              <th className="px-4 py-3 font-semibold text-right">Sağlam</th><th className="px-4 py-3 font-semibold text-right">Kesim firesi</th><th className="px-4 py-3 font-semibold text-right">Baskı firesi (m)</th><th className="px-4 py-3 font-semibold text-right">Fire oranı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((x) => (
              <tr key={`${x.key}-${x.stage}`}>
                <td className="px-4 py-3">{x.key}</td>
                <td className="px-4 py-3">{stageLabel(sector, x.stage)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.jobs}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.good.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.cutWaste.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.printWaste.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{x.good + x.cutWaste > 0 && x.stage !== 'printing' ? `%${((x.cutWaste / (x.good + x.cutWaste)) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—'}</td>
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
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Makine, personel ve iş raporu</h1>
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5">
        <label className="text-sm font-medium">Başlangıç<input type="date" name="from" defaultValue={from} className={fieldClass} /></label>
        <label className="text-sm font-medium">Bitiş<input type="date" name="to" defaultValue={to} className={fieldClass} /></label>
        <button className="min-h-10 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-stone-800">Göster</button>
      </form>
      <p className="text-sm text-stone-600">Fire, aşamanın kendi makinesine ve personeline yazılır: baskı firesi baskıya, kesim firesi kesim ve bitiş aşamalarına.</p>
      {table('Makineler', r.data.byMachine)}
      {table('Personel', r.data.byStaff)}
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-stone-900">İşler</h2>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold text-left">İş</th><th className="px-4 py-3 font-semibold text-left">Müşteri</th><th className="px-4 py-3 font-semibold text-right">Hedef</th>
                <th className="px-4 py-3 font-semibold text-right">Sağlam</th><th className="px-4 py-3 font-semibold text-right">Kesim firesi</th><th className="px-4 py-3 font-semibold text-right">Baskı firesi (m)</th><th className="px-4 py-3 font-semibold text-right">Fire oranı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {r.data.byJob.map((j) => (
                <tr key={j.jobId}>
                  <td className="px-4 py-3 font-mono"><Link href={`/uretim/is/${j.jobId}`} className="underline">{j.jobNo}</Link></td>
                  <td className="px-4 py-3">{j.partyName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.target.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.good.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.cutWaste.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.printWaste.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">%{Number(j.wasteRate).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {!r.data.byJob.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-stone-500">Bu aralıkta bitirilen aşama yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
