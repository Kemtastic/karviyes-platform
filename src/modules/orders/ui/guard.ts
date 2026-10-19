import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getConfig } from '@/core/company/config';
import { isModuleEnabled } from '@/core/modules/registry';

// Modül kapalıysa veya kullanıcı ofis rolünde değilse sayfa yok sayılır.
export async function requireOrdersPage() {
  const user = await getCurrentUser();
  if (!user || !isModuleEnabled('orders', (await getConfig())) || !user.roles.some((r) => r === 'admin' || r === 'sales' || r === 'tracking')) notFound();
  return user;
}
