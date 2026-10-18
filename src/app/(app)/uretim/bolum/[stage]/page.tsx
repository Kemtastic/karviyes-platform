import { notFound } from 'next/navigation';
import { getInstallConfig } from '@/core/install-config';
import { DEPARTMENT_ROLES } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { departmentQueue, listWorkshopStaff } from '@/modules/production/server/queries';
import { DepartmentScreen } from '@/modules/production/ui/department-screen';
import { requireProductionPage } from '@/modules/production/ui/guard';

export default async function DepartmentPage({ params }: { params: Promise<{ stage: string }> }) {
  await requireProductionPage(['admin', 'tracking', ...DEPARTMENT_ROLES]);
  const { stage } = await params;
  const sector = getInstallConfig().sector;
  const def = getSector(sector).stages.find((s) => s.id === stage);
  if (!def) notFound();
  const [queue, staff] = await Promise.all([departmentQueue({ stage }), listWorkshopStaff({ stage })]);
  if (!queue.ok) notFound();
  return <DepartmentScreen stage={stage} title={def.label} sector={sector} initial={queue.data} staff={staff.ok ? staff.data : []} />;
}
