import { notFound } from 'next/navigation';
import { listFabric } from '@/modules/production/server/queries';
import { FabricScreen } from '@/modules/production/ui/fabric-screen';
import { requireProductionPage } from '@/modules/production/ui/guard';

export default async function FabricPage() {
  await requireProductionPage(['admin', 'tracking']);
  const r = await listFabric({});
  if (!r.ok) notFound();
  return <FabricScreen rows={r.data.map((f) => ({ id: f.id, colour: f.colour, widthCm: Number(f.widthCm), gsm: f.gsm, metres: f.metres, status: f.status, jobNo: f.jobNo }))} />;
}
