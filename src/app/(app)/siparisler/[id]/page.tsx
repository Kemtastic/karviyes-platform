import { isModuleEnabled } from '@/core/modules/registry';
import { notFound } from 'next/navigation';
import { getInstallConfig } from '@/core/install-config';
import { getSector } from '@/sectors';
import { orderForOffice } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderDetail } from '@/modules/orders/ui/order-detail';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrdersPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await orderForOffice({ id });
  if (!r.ok) notFound();
  const stageLabels = Object.fromEntries(getSector(getInstallConfig().sector).stages.map((st) => [st.id, st.label]));
  return <OrderDetail order={r.data} stageLabels={stageLabels} canMarkInvoice={user.roles.some((x) => x === 'admin' || x === 'tracking')} financeEnabled={isModuleEnabled('finance', getInstallConfig())} />;
}
