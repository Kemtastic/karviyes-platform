import { notFound, redirect } from 'next/navigation';
import { getConfig } from '@/core/company/config';
import type { Currency } from '@/core/money';
import { listSalesStaff, orderForOffice } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderForm } from '@/modules/orders/ui/order-form';
import { PageHeader } from '@/ui/page-header';
import { listPlates } from '@/modules/production/server/plates';

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrdersPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await orderForOffice({ id });
  if (!r.ok) notFound();
  const o = r.data;
  // Yalnızca taslak sipariş düzenlenir; üretime alınmış sipariş detay sayfasına döner.
  if (o.status !== 'draft') redirect(`/siparisler/${o.id}`);
  const [staff, plates] = await Promise.all([listSalesStaff({}), listPlates({ partyId: o.party.id })]);
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader eyebrow={o.no} title="Siparişi düzenle" description="Taslak sipariş üretime alınana kadar değiştirilebilir." />
      <OrderForm
        sector={(await getConfig()).sector}
        salesStaff={staff.ok ? staff.data.map((s) => ({ id: s.id, name: s.name })) : []}
        initialPlates={plates.ok ? plates.data.map((p) => ({ id: p.id, name: p.name, colours: p.colours })) : []}
        initial={{
          id: o.id,
          version: o.version,
          party: { id: o.party.id, name: o.party.name },
          salespersonStaffId: o.salespersonStaffId,
          orderDate: o.orderDate,
          deliveryDate: o.deliveryDate,
          currency: o.currency as Currency,
          fxRate: o.fxRate,
          fxRateDate: o.fxRateDate,
          lines: o.lines.map((l) => ({ product: l.product as Record<string, unknown>, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate, packaging: l.packaging, departmentNotes: l.departmentNotes, plateId: l.plateId })),
        }}
      />
    </div>
  );
}
