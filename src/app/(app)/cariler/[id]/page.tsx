import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { partyDetail } from '@/core/parties/service';
import { PartyForm } from '../party-form';

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  // Rol denetimi sorgunun içinde: yalnızca yönetici, satış ve üretim takip görür.
  const r = await partyDetail({ id });
  if (!r.ok) notFound();
  const party = r.data;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{party.name}</h1>
      <PartyForm party={party} canArchive={user.roles.some((x) => x === 'admin' || x === 'tracking')} />
    </div>
  );
}
