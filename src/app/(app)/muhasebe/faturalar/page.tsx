import { notFound } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import { buttonClasses } from '@/ui/button';

import { istanbulToday } from '@/core/dates';
import { accountOptions, invoicesList } from '@/modules/finance/server/queries';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { InvoicesTable } from '@/modules/finance/ui/lists';
import { FinanceToolbar } from '@/modules/finance/ui/toolbar';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';

const KINDS = { satis: 'sales', alis: 'purchase', 'satis-iade': 'sales_return', 'alis-iade': 'purchase_return' } as const;
const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tur?: string; bas?: string; bit?: string }> }) {
  await requireFinancePage();
  const sp = await searchParams;
  const kind = sp.tur && sp.tur in KINDS ? KINDS[sp.tur as keyof typeof KINDS] : undefined;
  const today = istanbulToday();
  const from = isDate(sp.bas) ? sp.bas! : `${today.slice(0, 4)}-01-01`;
  const to = isDate(sp.bit) ? sp.bit! : today;
  const [r, accounts] = await Promise.all([invoicesList({ kind, from, to }), accountOptions({})]);
  if (!r.ok) notFound();
  const q = (tur?: string) => `/muhasebe/faturalar?${new URLSearchParams({ ...(tur ? { tur } : {}), bas: from, bit: to })}`;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Fatura kayıtları"
        description="e-Fatura, e-Arşiv ya da kâğıt olarak kesilmiş faturaların cariye işlenmiş kayıtları. Bu sistem resmî fatura kesmez."
        actions={<><FinanceToolbar actions={['sales', 'purchase', 'sales_return', 'purchase_return']} accounts={accounts.ok ? accounts.data : []} /><a href={`/api/disa-aktar/muhasebe?tur=faturalar&bas=${from}&bit=${to}`} className={buttonClasses('secondary')}><FileSpreadsheet aria-hidden className="h-4 w-4" /> Excel&apos;e aktar</a></>}
      />
      <LinkTabs label="Fatura türü" items={[{ href: q(), label: 'Tümü', active: !kind }, { href: q('satis'), label: 'Satış', active: kind === 'sales' }, { href: q('alis'), label: 'Alış', active: kind === 'purchase' }, { href: q('satis-iade'), label: 'Satış iadesi', active: kind === 'sales_return' }, { href: q('alis-iade'), label: 'Alış iadesi', active: kind === 'purchase_return' }]} />
      <FilterBar>
        {kind && <input type="hidden" name="tur" value={sp.tur} />}
        <FilterField label="Başlangıç"><input type="date" name="bas" defaultValue={from} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="bit" defaultValue={to} className={filterInputClass} /></FilterField>
        <button className={filterButtonClass}>Göster</button>
      </FilterBar>
      <InvoicesTable rows={r.data} />
    </div>
  );
}
