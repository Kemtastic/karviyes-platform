import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getDb } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { parties } from '@/core/db/schema';
import { PartyForm } from '../party-form';

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.kind === 'device') notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [party] = await withCompany(user.companyId, (tx) => tx.select().from(parties).where(eq(parties.id, id)), await getDb());
  if (!party) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{party.name}</h1>
      <PartyForm party={party} canArchive={user.roles.some((r) => r === 'admin' || r === 'tracking')} />
    </div>
  );
}
