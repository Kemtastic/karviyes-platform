import { istanbulToday } from '@/core/dates';
import { ERROR_STATUS, type AppErrorCode } from '@/core/errors';
import { exportCompanyData } from '@/core/platform/export';
import { publicRateLimited } from '@/core/rate-limit';

export const preferredRegion = 'fra1';

// Merkez panel: firmanın bütün verisi tek JSON dosyası (yetki ve kayıt eylemin içinde).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Başka siteden açılan bağlantı (yöneticinin oturumuyla) dışa aktarım tetikleyemez; dakikada en çok 10 dışa aktarım.
  if (req.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ ok: false, message: 'Bu bağlantı yalnız panelden açılır.' }, { status: 403 });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'bilinmiyor';
  if (await publicRateLimited(`platform-export:${ip}`, 10)) return Response.json({ ok: false, message: 'Çok fazla istek.' }, { status: 429 });
  const { id } = await params;
  const r = await exportCompanyData({ companyId: id });
  if (!r.ok) return Response.json(r, { status: ERROR_STATUS[r.code as AppErrorCode] ?? 400 });
  const slug = String(r.data.company.slug ?? 'firma');
  return new Response(JSON.stringify(r.data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${slug}-veri-${istanbulToday()}.json"`,
      'cache-control': 'no-store',
    },
  });
}
