import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getConfig } from '@/core/company/config';
import { isModuleEnabled } from '@/core/modules/registry';

// Modül kapalıysa veya kullanıcı yönetici/satış değilse sayfa yok sayılır.
export async function requireSalesPage() {
  const user = await getCurrentUser();
  if (!user || !isModuleEnabled('sales', (await getConfig())) || !user.roles.some((r) => r === 'admin' || r === 'sales')) notFound();
  return user;
}

export async function canUseSales() {
  const user = await getCurrentUser();
  return Boolean(user && isModuleEnabled('sales', (await getConfig())) && user.roles.some((r) => r === 'admin' || r === 'sales'));
}
