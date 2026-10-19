import { renderProformaPdf } from '@/core/pdf/documents';
import { pdfResponse } from '@/core/pdf/response';
import { orderProforma } from '@/modules/orders/server/queries';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

// ?gun=15 geçerlilik süresi (1–90 gün).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const days = Number(new URL(req.url).searchParams.get('gun') ?? 15);
  const r = await orderProforma({ id, validDays: Number.isInteger(days) && days >= 1 && days <= 90 ? days : 15 });
  if (!r.ok) return new Response('Bulunamadı', { status: r.code === 'UNAUTHENTICATED' ? 401 : 404 });
  return pdfResponse(await renderProformaPdf(r.data), `proforma-${r.data.no}.pdf`);
}
