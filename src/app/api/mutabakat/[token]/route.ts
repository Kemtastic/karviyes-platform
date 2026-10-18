import { pdfResponse } from '@/core/pdf/response';
import { publicRateLimited } from '@/core/rate-limit';
import { publicReconciliation } from '@/modules/finance/server/reconciliation';
import { reconciliationPdf } from '@/modules/finance/server/reconciliation-pdf';

// Karşı tarafın PDF'i: oturum gerekmez, bağlantıdaki gizli anahtar yeterlidir.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'bilinmiyor';
  if (await publicRateLimited(`mutabakat-pdf:${ip}`)) return new Response('Çok fazla istek. Bir dakika sonra tekrar deneyin.', { status: 429 });
  const { token } = await params;
  const r = await publicReconciliation(token);
  if (!r) return new Response('Bağlantı geçersiz ya da süresi dolmuş.', { status: 404 });
  return pdfResponse(await reconciliationPdf({ ...r, snapshot: { company: r.company, partyName: r.partyName, taxId: '', rows: r.rows, truncated: r.truncated } }), `mutabakat-${r.no}.pdf`);
}
