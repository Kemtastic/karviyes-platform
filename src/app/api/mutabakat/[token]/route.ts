import { pdfResponse } from '@/core/pdf/response';
import { publicReconciliation } from '@/modules/finance/server/reconciliation';
import { reconciliationPdf } from '@/modules/finance/server/reconciliation-pdf';

// Karşı tarafın PDF'i: oturum gerekmez, bağlantıdaki gizli anahtar yeterlidir.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await publicReconciliation(token);
  if (!r) return new Response('Bağlantı geçersiz ya da süresi dolmuş.', { status: 404 });
  return pdfResponse(await reconciliationPdf({ ...r, snapshot: { company: r.company, partyName: r.partyName, taxId: '', rows: r.rows, truncated: r.truncated } }), `mutabakat-${r.no}.pdf`);
}
