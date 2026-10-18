import { notFound } from 'next/navigation';
import { accountsList } from '@/modules/finance/server/queries';
import { AccountsScreen } from '@/modules/finance/ui/accounts';
import { requireFinancePage } from '@/modules/finance/ui/guard';

export default async function AccountsPage() {
  await requireFinancePage();
  const r = await accountsList({});
  if (!r.ok) notFound();
  return <AccountsScreen rows={r.data} />;
}
