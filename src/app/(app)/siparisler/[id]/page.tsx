import { notFound } from 'next/navigation';
import { orderForOffice } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderDetail } from '@/modules/orders/ui/order-detail';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrdersPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await orderForOffice({ id });
  if (!r.ok) notFound();
  return <OrderDetail order={r.data} canMarkInvoice={user.roles.some((x) => x === 'admin' || x === 'tracking')} />;
}
