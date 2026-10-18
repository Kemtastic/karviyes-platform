import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { isModuleEnabled } from '@/core/modules/registry';

// Modül kapalıysa veya kullanıcı yönetici/satış değilse sayfa yok sayılır.
export async function requireSalesPage() {
  const user = await getCurrentUser();
  if (!user || !isModuleEnabled('sales', getInstallConfig()) || !user.roles.some((r) => r === 'admin' || r === 'sales')) notFound();
  return user;
}

export async function canUseSales() {
  const user = await getCurrentUser();
  return Boolean(user && isModuleEnabled('sales', getInstallConfig()) && user.roles.some((r) => r === 'admin' || r === 'sales'));
}
