import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { accountOptions } from '@/modules/finance/server/queries';
import { recurringList } from '@/modules/finance/server/recurring';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { RecurringTable } from '@/modules/finance/ui/recurring';
import { PageHeader } from '@/ui/page-header';

export default async function RecurringPage() {
  await requireFinancePage();
  const [r, accounts] = await Promise.all([recurringList({}), accountOptions({})]);
  if (!r.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Tekrarlayan kayıtlar"
        description="Kira, aidat, abonelik gibi her ay aynı tutarla işlenen masraf ve gelirler. Kendiliğinden işlenmez: vadesi gelen ay için “İşle” deyince o günün tarihiyle kaydedilir."
      />
      <RecurringTable rows={r.data} accounts={accounts.ok ? accounts.data : []} today={istanbulToday()} />
    </div>
  );
}
