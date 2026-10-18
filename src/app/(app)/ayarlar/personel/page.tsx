import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { listStaff } from '@/core/users/queries';
import { StaffScreen } from './staff-screen';

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user?.roles.includes('admin')) notFound();
  const rows = await listStaff(user.companyId);
  return <StaffScreen rows={rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, departments: r.departments, active: r.active, version: r.version }))} />;
}
