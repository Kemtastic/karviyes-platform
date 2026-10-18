import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { isModuleEnabled } from '@/core/modules/registry';
import type { Role } from '@/core/modules/types';

export async function requireProductionPage(roles: Role[]) {
  const user = await getCurrentUser();
  if (!user || !isModuleEnabled('production', getInstallConfig()) || !user.roles.some((r) => roles.includes(r))) notFound();
  return user;
}
