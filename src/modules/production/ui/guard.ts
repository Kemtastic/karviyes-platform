import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getConfig } from '@/core/company/config';
import { isModuleEnabled } from '@/core/modules/registry';
import type { Role } from '@/core/modules/types';

export async function requireProductionPage(roles: Role[]) {
  const user = await getCurrentUser();
  if (!user || !isModuleEnabled('production', (await getConfig())) || !user.roles.some((r) => roles.includes(r))) notFound();
  return user;
}
