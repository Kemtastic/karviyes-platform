import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getConfig } from '@/core/company/config';
import { isModuleEnabled } from '@/core/modules/registry';

// Ön muhasebe ekranları: modül açık ve kullanıcı yönetici ya da muhasebe rolünde olmalı.
export async function requireFinancePage() {
  const user = await getCurrentUser();
  if (!user || !isModuleEnabled('finance', (await getConfig())) || !user.roles.some((r) => r === 'admin' || r === 'accounting')) notFound();
  return user;
}

export async function canUseFinance(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && isModuleEnabled('finance', (await getConfig())) && user.roles.some((r) => r === 'admin' || r === 'accounting'));
}
