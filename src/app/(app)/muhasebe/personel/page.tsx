import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { accountOptions } from '@/modules/finance/server/queries';
import { staffBalances, staffLedger } from '@/modules/finance/server/staff-ledger';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { StaffLedgerScreen } from '@/modules/finance/ui/staff-ledger';
import { PageHeader } from '@/ui/page-header';

export default async function StaffLedgerPage({ searchParams }: { searchParams: Promise<{ kisi?: string }> }) {
  await requireFinancePage();
  const { kisi } = await searchParams;
  const id = kisi && /^[0-9a-f-]{36}$/.test(kisi) ? kisi : null;
  const [balances, accounts, ledger] = await Promise.all([staffBalances({}), accountOptions({}), id ? staffLedger({ staffId: id }) : null]);
  if (!balances.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Personel carisi"
        description="Maaş ve prim tahakkuku, avans, maaş ödemesi ve kesintiler; kişi bazında bakiye. Ödemeler kasa/bankadan Personel masrafı olarak da düşülür. Yalnız yönetici ve muhasebe görür."
      />
      <StaffLedgerScreen balances={balances.data} ledger={ledger?.ok ? ledger.data : null} accounts={accounts.ok ? accounts.data : []} today={istanbulToday()} />
    </div>
  );
}
