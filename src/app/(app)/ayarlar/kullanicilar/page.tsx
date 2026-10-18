import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { listMembers } from '@/core/users/queries';
import { UsersScreen } from './users-screen';

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user?.roles.includes('admin')) notFound();
  return <UsersScreen members={await listMembers(user.companyId)} currentMembershipId={user.membershipId} />;
}
