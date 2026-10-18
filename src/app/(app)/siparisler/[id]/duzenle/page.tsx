import { notFound, redirect } from 'next/navigation';
import { getInstallConfig } from '@/core/install-config';
import type { Currency } from '@/core/money';
import { listSalesStaff, orderForOffice } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderForm } from '@/modules/orders/ui/order-form';

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrdersPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await orderForOffice({ id });
  if (!r.ok) notFound();
  const o = r.data;
  // Yalnızca taslak sipariş düzenlenir; üretime alınmış sipariş detay sayfasına döner.
  if (o.status !== 'draft') redirect(`/siparisler/${o.id}`);
  const staff = await listSalesStaff({});
  return (
    <div className="max-w-4xl space-y-4">
      <p className="font-mono text-sm text-stone-500">{o.no}</p>
      <h1 className="text-2xl font-semibold">Siparişi düzenle</h1>
      <OrderForm
        sector={getInstallConfig().sector}
        salesStaff={staff.ok ? staff.data.map((s) => ({ id: s.id, name: s.name })) : []}
        initial={{
          id: o.id,
          version: o.version,
          party: { id: o.party.id, name: o.party.name },
          salespersonStaffId: o.salespersonStaffId,
          orderDate: o.orderDate,
          currency: o.currency as Currency,
          fxRate: o.fxRate,
          fxRateDate: o.fxRateDate,
          lines: o.lines.map((l) => ({ product: l.product as Record<string, unknown>, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate, packaging: l.packaging, departmentNotes: l.departmentNotes })),
        }}
      />
    </div>
  );
}
