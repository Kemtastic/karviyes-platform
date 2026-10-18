import { notFound } from 'next/navigation';
import { accountOptions, partyBalances } from '@/modules/finance/server/queries';
import { BalancesTable } from '@/modules/finance/ui/balances';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { FinanceToolbar } from '@/modules/finance/ui/toolbar';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';

export default async function BalancesPage({ searchParams }: { searchParams: Promise<{ yon?: string }> }) {
  await requireFinancePage();
  const side = (await searchParams).yon === 'borc' ? 'payable' : 'receivable';
  const [r, accounts] = await Promise.all([partyBalances({}), accountOptions({})]);
  if (!r.ok) notFound();
  const count = (s: 'receivable' | 'payable') => r.data.filter((x) => BigInt(String((s === 'receivable' ? x.receivable : x.payable).total)) > 0n).length;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Cari bakiyeler"
        description="Fatura kayıtları, tahsilat/ödemeler ve çeklerden hesaplanan bakiye; açık kalemler vadesine göre yaşlandırılır. Satıra tıklayınca ekstre açılır."
        actions={<FinanceToolbar actions={side === 'receivable' ? ['collection', 'sales'] : ['payment', 'purchase']} accounts={accounts.ok ? accounts.data : []} />}
      />
      <LinkTabs label="Bakiye yönü" items={[
        { href: '/muhasebe/cariler', label: 'Alacaklar', active: side === 'receivable', count: count('receivable') },
        { href: '/muhasebe/cariler?yon=borc', label: 'Borçlar', active: side === 'payable', count: count('payable') },
      ]} />
      <BalancesTable rows={r.data} side={side} />
    </div>
  );
}
