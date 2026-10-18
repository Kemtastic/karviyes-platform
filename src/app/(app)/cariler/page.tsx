import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { searchParties } from '@/core/parties/service';
import { PartiesScreen } from './parties-screen';

export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.kind === 'device') notFound();
  const { q = '' } = await searchParams;
  const result = await searchParties({ q, limit: 200 });
  if (!result.ok) notFound();
  return <PartiesScreen initialQuery={q} rows={result.data.map((p) => ({ id: p.id, name: p.name, kind: p.kind, city: p.city, district: p.district, contactName: p.contactName, phone: p.phone, taxId: p.taxId }))} />;
}
