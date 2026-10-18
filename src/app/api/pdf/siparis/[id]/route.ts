import { companyProfile } from '@/core/company/service';
import { getInstallConfig } from '@/core/install-config';
import { formatMoney, money, moneyFromJSON, subMoney, type Currency } from '@/core/money';
import { renderOrderPdf } from '@/core/pdf/documents';
import { pdfResponse } from '@/core/pdf/response';
import { PACKAGING_LABELS } from '@/modules/orders/domain/packaging';
import { orderForOffice } from '@/modules/orders/server/queries';
import { getSector } from '@/sectors';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await orderForOffice({ id });
  if (!r.ok) return new Response('Bulunamadı', { status: r.code === 'UNAUTHENTICATED' ? 401 : 404 });
  const o = r.data;
  const cfg = getInstallConfig();
  const profile = await companyProfile({});
  const total = moneyFromJSON(o.total);
  const balance = moneyFromJSON(o.balance);
  const paid = subMoney(total, balance);
  const labels = Object.fromEntries(getSector(cfg.sector).stages.map((s) => [s.id, s.label]));
  const bytes = await renderOrderPdf(
    {
      no: o.no, company: profile.ok ? profile.data.name : cfg.company.name, partyName: o.party.name, orderDate: o.orderDate, quantity: o.quantity, productText: o.productText,
      packaging: `${PACKAGING_LABELS[o.packaging.type as keyof typeof PACKAGING_LABELS]}${o.packaging.packages ? ` · ${o.packaging.packages} × ${o.packaging.capacity}` : ''}`,
      departmentNotes: o.departmentNotes, salesperson: o.salesperson, unitPrice: o.unitPrice, vatRate: o.vatRate,
      total: formatMoney(total), paid: formatMoney(paid.minor < 0n ? money(0n, o.currency as Currency) : paid), balance: formatMoney(balance),
    },
    labels,
  );
  return pdfResponse(bytes, `siparis-${o.no}.pdf`);
}
