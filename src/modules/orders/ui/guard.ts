import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { isModuleEnabled } from '@/core/modules/registry';

// Modül kapalıysa veya kullanıcı ofis rolünde değilse sayfa yok sayılır.
export async function requireOrdersPage() {
  const user = await getCurrentUser();
  if (!user || !isModuleEnabled('orders', getInstallConfig()) || !user.roles.some((r) => r === 'admin' || r === 'sales' || r === 'tracking')) notFound();
  return user;
}
