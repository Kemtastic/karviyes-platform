import Link from 'next/link';
import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { REPORT_GROUPS, salesReport } from '@/modules/orders/server/reports';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { SalesReportTable } from '@/modules/orders/ui/sales-report-table';

const GROUP_LABELS: Record<(typeof REPORT_GROUPS)[number], string> = { salesperson: 'Satışçı', customer: 'Müşteri', month: 'Ay', product: 'Ürün' };
const isDate = (v: string | undefined) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export default async function SalesReportsPage({ searchParams }: { searchParams: Promise<{ kirilim?: string; bas?: string; bit?: string }> }) {
  await requireOrdersPage();
  const sp = await searchParams;
  const today = istanbulToday();
  const groupBy = (REPORT_GROUPS as readonly string[]).includes(sp.kirilim ?? '') ? (sp.kirilim as (typeof REPORT_GROUPS)[number]) : 'salesperson';
  const from = isDate(sp.bas) ? sp.bas! : `${today.slice(0, 4)}-01-01`;
  const to = isDate(sp.bit) ? sp.bit! : today;
  const r = await salesReport({ from, to, groupBy });
  if (!r.ok) notFound();
  const href = (g: string) => `/siparisler/raporlar?kirilim=${g}&bas=${from}&bit=${to}`;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Satış raporları</h1>
        <p className="text-stone-600">Sipariş tarihine göre; iptal edilen siparişler ve satırlar hariç. Fatura bazlı değildir.</p>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="kirilim" value={groupBy} />
        <label className="flex flex-col text-sm">Başlangıç<input type="date" name="bas" defaultValue={from} className="min-h-11 rounded-lg border border-stone-300 px-3" /></label>
        <label className="flex flex-col text-sm">Bitiş<input type="date" name="bit" defaultValue={to} className="min-h-11 rounded-lg border border-stone-300 px-3" /></label>
        <button className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">Göster</button>
      </form>
      <nav aria-label="Kırılım" className="flex flex-wrap gap-2">
        {REPORT_GROUPS.map((g) => (
          <Link key={g} href={href(g)} aria-current={groupBy === g ? 'page' : undefined} className="rounded-full border px-3 py-1 text-sm aria-[current=page]:bg-stone-900 aria-[current=page]:text-white">
            {GROUP_LABELS[g]}
          </Link>
        ))}
      </nav>
      <SalesReportTable rows={r.data.rows} groupLabel={GROUP_LABELS[groupBy]} showPrices={groupBy === 'product'} />
    </div>
  );
}
