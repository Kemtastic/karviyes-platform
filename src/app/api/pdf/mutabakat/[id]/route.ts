import { pdfResponse } from '@/core/pdf/response';
import { reconciliationDetail } from '@/modules/finance/server/reconciliation';
import { reconciliationPdf } from '@/modules/finance/server/reconciliation-pdf';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await reconciliationDetail({ id });
  if (!r.ok) return new Response('Bulunamadı', { status: r.code === 'UNAUTHENTICATED' ? 401 : 404 });
  return pdfResponse(await reconciliationPdf(r.data), `mutabakat-${r.data.no}.pdf`);
}
