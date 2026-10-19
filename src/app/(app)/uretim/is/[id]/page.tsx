import { notFound } from 'next/navigation';
import { getConfig } from '@/core/company/config';
import { jobDetail, listFabric, listWorkshopStaff } from '@/modules/production/server/queries';
import { requireProductionPage } from '@/modules/production/ui/guard';
import { JobScreen } from '@/modules/production/ui/job-screen';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireProductionPage(['admin', 'tracking', 'sales', 'slitting', 'printing', 'cutting', 'finishing', 'repair']);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const job = await jobDetail({ id });
  if (!job.ok) notFound();
  const canManage = user.roles.some((r) => r === 'admin' || r === 'tracking');
  const fabric = canManage && job.data.stage === 'waiting' ? await listFabric({ status: 'available' }) : null;
  const staff = await listWorkshopStaff({ stage: job.data.stage });
  return (
    <JobScreen
      job={job.data}
      sector={(await getConfig()).sector}
      canManage={canManage}
      fabric={fabric?.ok ? fabric.data.map((f) => ({ id: f.id, label: `${f.colour} · ${Number(f.widthCm)} cm · ${f.gsm} gr · ${f.metres} m` })) : []}
      staff={staff.ok ? staff.data : []}
      userRoles={user.roles}
    />
  );
}
