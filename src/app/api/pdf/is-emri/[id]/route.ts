import { companyProfile } from '@/core/company/service';
import { getInstallConfig } from '@/core/install-config';
import { renderJobPdf } from '@/core/pdf/documents';
import { pdfResponse } from '@/core/pdf/response';
import { PACKAGING_LABELS } from '@/modules/orders/domain/packaging';
import { jobDetail } from '@/modules/production/server/queries';
import { getSector } from '@/sectors';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

// İş emri bölüm tabletlerinden de basılabilir; fiyat içermez.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await jobDetail({ id });
  if (!r.ok) return new Response('Bulunamadı', { status: r.code === 'UNAUTHENTICATED' ? 401 : 404 });
  const j = r.data;
  const cfg = getInstallConfig();
  const profile = await companyProfile({});
  const labels = Object.fromEntries(getSector(cfg.sector).stages.map((s) => [s.id, s.label]));
  const bytes = await renderJobPdf(
    {
      no: j.no, company: profile.ok ? profile.data.name : cfg.company.name, partyName: j.partyName, orderDate: j.orderDate, quantity: j.quantity, productText: j.productText,
      packaging: `${PACKAGING_LABELS[j.packaging.type as keyof typeof PACKAGING_LABELS]}${j.packaging.packages ? ` · ${j.packaging.packages} × ${j.packaging.capacity}` : ''}`,
      departmentNotes: j.departmentNotes,
    },
    labels,
  );
  return pdfResponse(bytes, `is-emri-${j.no}.pdf`);
}
