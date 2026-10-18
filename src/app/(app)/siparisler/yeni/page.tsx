import { getInstallConfig } from '@/core/install-config';
import { listSalesStaff } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderForm } from '@/modules/orders/ui/order-form';

export default async function NewOrderPage() {
  await requireOrdersPage();
  const staff = await listSalesStaff({});
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Yeni sipariş</h1>
      <OrderForm sector={getInstallConfig().sector} salesStaff={staff.ok ? staff.data.map((s) => ({ id: s.id, name: s.name })) : []} />
    </div>
  );
}
