import { renderShipmentSlipPdf } from '@/core/pdf/documents';
import { pdfResponse } from '@/core/pdf/response';
import { shipmentSlip } from '@/modules/production/server/queries';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await shipmentSlip({ id });
  if (!r.ok) return new Response('Bulunamadı', { status: r.code === 'UNAUTHENTICATED' ? 401 : 404 });
  return pdfResponse(await renderShipmentSlipPdf(r.data), `sevk-${r.data.jobNo.replace(/[^\w-]+/g, '-')}-${r.data.shippedAt}.pdf`);
}
