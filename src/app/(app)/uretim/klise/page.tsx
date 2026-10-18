import { notFound } from 'next/navigation';
import { listPlates } from '@/modules/production/server/plates';
import { PlatesScreen } from '@/modules/production/ui/plates-screen';
import { requireProductionPage } from '@/modules/production/ui/guard';

export default async function PlatesPage() {
  await requireProductionPage(['admin', 'tracking', 'sales']);
  const r = await listPlates({});
  if (!r.ok) notFound();
  return <PlatesScreen rows={r.data} />;
}
