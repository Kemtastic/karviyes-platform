import { companyProfile } from '@/core/company/service';
import { getConfig } from '@/core/company/config';
import { formatMoney, money, moneyFromJSON, type Currency } from '@/core/money';
import { renderOrderPdf } from '@/core/pdf/documents';
import { pdfResponse } from '@/core/pdf/response';
import { PACKAGING_LABELS } from '@/modules/orders/domain/packaging';
import { orderForOffice } from '@/modules/orders/server/queries';
import { getSector } from '@/sectors';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await orderForOffice({ id });
  if (!r.ok) return new Response('Bulunamadı', { status: r.code === 'UNAUTHENTICATED' ? 401 : 404 });
  const o = r.data;
  const cfg = (await getConfig());
  const profile = await companyProfile({});
  const currency = o.currency as Currency;
  const total = moneyFromJSON(o.total);
  const balance = moneyFromJSON(o.balance);
  // Tahsil edilen: ödemelerin toplamı (iptal edilen siparişte toplam − kalan tahsilatı vermez).
  const paid = money(o.payments.reduce((s, p) => s + BigInt(p.amount.minor), 0n), currency);
  const labels = Object.fromEntries(getSector(cfg.sector).stages.map((s) => [s.id, s.label]));
  const bytes = await renderOrderPdf(
    {
      no: o.no, company: profile.ok ? profile.data.name : cfg.company.name, partyName: o.party.name, orderDate: o.orderDate, salesperson: o.salesperson,
      lines: o.lines.map((l) => ({
        lineNo: l.lineNo, productText: l.productText, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate, total: formatMoney(moneyFromJSON(l.total)),
        packaging: `${PACKAGING_LABELS[l.packaging.type as keyof typeof PACKAGING_LABELS]}${l.packaging.packages ? ` · ${l.packaging.packages} × ${l.packaging.capacity}` : ''}`,
        departmentNotes: l.departmentNotes, cancelled: l.status === 'cancelled',
      })),
      total: formatMoney(total), paid: formatMoney(paid), balance: formatMoney(balance),
    },
    labels,
  );
  return pdfResponse(bytes, `siparis-${o.no}.pdf`);
}
