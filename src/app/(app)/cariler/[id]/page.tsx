import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { isModuleEnabled } from '@/core/modules/registry';
import { partyDetail } from '@/core/parties/service';
import { customerAccount } from '@/modules/orders/server/queries';
import { CustomerAccount } from '@/modules/orders/ui/customer-account';
import { partyCalls, salesStaffList } from '@/modules/sales/server/queries';
import { canUseSales } from '@/modules/sales/ui/guard';
import { PartyCalls } from '@/modules/sales/ui/party-calls';
import { PartyForm } from '../party-form';

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  // Rol denetimi sorgunun içinde: yalnızca yönetici, satış ve üretim takip görür.
  const r = await partyDetail({ id });
  if (!r.ok) notFound();
  const party = r.data;
  // Cari hesap sipariş modülünden gelir; modül kapalıysa veya cari yalnızca tedarikçiyse gösterilmez.
  const account = isModuleEnabled('orders', getInstallConfig()) && party.kind !== 'supplier' ? await customerAccount({ partyId: party.id }) : null;
  const sales = party.kind !== 'supplier' && !party.archived && (await canUseSales()) ? await Promise.all([partyCalls({ partyId: party.id }), salesStaffList({})]) : null;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{party.name}</h1>
      {account?.ok && <CustomerAccount account={account.data} />}
      {sales?.[0].ok && <PartyCalls party={{ id: party.id, name: party.name }} calls={sales[0].data.calls} responsibleStaffId={sales[0].data.responsibleStaffId} staff={sales[1].ok ? sales[1].data : []} />}
      <PartyForm party={party} canArchive={user.roles.some((x) => x === 'admin' || x === 'tracking')} />
    </div>
  );
}
