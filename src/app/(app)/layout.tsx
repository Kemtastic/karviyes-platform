import { redirect } from 'next/navigation';
import { mustEnrollTwoFactor } from '@/core/auth/policy';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/giris');
  if (mustEnrollTwoFactor(user, getInstallConfig())) redirect('/iki-adim-kurulum');
  return <>{children}</>;
}
