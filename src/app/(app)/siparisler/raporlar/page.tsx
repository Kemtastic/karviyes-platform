import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { REPORT_GROUPS, salesReport } from '@/modules/orders/server/reports';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { SalesReportTable } from '@/modules/orders/ui/sales-report-table';
import { formatMoney, money } from '@/core/money';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';

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
  const tryRows = r.data.rows.filter((x) => x.currency === 'TRY');
  const sum = (f: (x: (typeof tryRows)[number]) => bigint) => tryRows.reduce((acc, x) => acc + f(x), 0n);
  const orderCount = groupBy === 'customer' || groupBy === 'salesperson' || groupBy === 'month' ? tryRows.reduce((acc, x) => acc + x.orders, 0) : null;
  return (
    <div className="space-y-5">
      <PageHeader title="Satış raporları" description="Sipariş tarihine göre; iptal edilen siparişler ve satırlar hariç. Fatura bazlı değildir." />
      <FilterBar>
        <input type="hidden" name="kirilim" value={groupBy} />
        <FilterField label="Başlangıç"><input type="date" name="bas" defaultValue={from} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="bit" defaultValue={to} className={filterInputClass} /></FilterField>
        <button className={filterButtonClass}>Göster</button>
      </FilterBar>
      {tryRows.length > 0 && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Toplam (KDV dahil, TL)" value={formatMoney(money(sum((x) => BigInt(x.total.minor)), 'TRY'))} />
          <Tile label="KDV hariç (TL)" value={formatMoney(money(sum((x) => BigInt(x.net.minor)), 'TRY'))} />
          <Tile label="Adet" value={tryRows.reduce((acc, x) => acc + x.quantity, 0).toLocaleString('tr-TR')} />
          <Tile label="Sipariş" value={orderCount === null ? '—' : orderCount.toLocaleString('tr-TR')} />
        </section>
      )}
      <LinkTabs label="Kırılım" items={REPORT_GROUPS.map((g) => ({ href: href(g), label: GROUP_LABELS[g], active: groupBy === g }))} />
      <SalesReportTable rows={r.data.rows} groupLabel={GROUP_LABELS[groupBy]} showPrices={groupBy === 'product'} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}
