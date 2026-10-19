import { getConfig } from '@/core/company/config';
import { listSalesStaff } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderForm } from '@/modules/orders/ui/order-form';
import { PageHeader } from '@/ui/page-header';

export default async function NewOrderPage() {
  await requireOrdersPage();
  const staff = await listSalesStaff({});
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader eyebrow="Siparişler" title="Yeni sipariş" description="Müşteriyi seçin, ürünleri girin; adet boş bırakılırsa bobin sayısından hesaplanan hedef adet kullanılır." />
      <OrderForm sector={(await getConfig()).sector} salesStaff={staff.ok ? staff.data.map((s) => ({ id: s.id, name: s.name })) : []} />
    </div>
  );
}
