import { createHash, timingSafeEqual } from 'node:crypto';
import { syncInstallFromCentral } from '@/core/platform/central-sync';

// Müşteri sunucusu: zamanlanmış görev (cron) bu adresi kurulum anahtarıyla çağırır; ayar merkezden çekilip uygulanır.
// curl -X POST -H "Authorization: Bearer $CENTRAL_INSTALL_TOKEN" https://<kurulum>/api/kurulum/esitle
export async function POST(req: Request) {
  const expected = process.env.CENTRAL_INSTALL_TOKEN;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!expected || !given || !timingSafeEqual(digest(given), digest(expected))) return Response.json({ ok: false, message: 'Yetkisiz.' }, { status: 401 });
  const r = await syncInstallFromCentral();
  return Response.json({ ok: r.applied, ...r }, { status: r.applied ? 200 : 502 });
}
