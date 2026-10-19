import { getDb } from '@/core/db/client';
import { centralBundleFor } from '@/core/platform/signed-config';
import { publicRateLimited } from '@/core/rate-limit';

export const preferredRegion = 'fra1';

// Merkez: müşterinin kendi sunucusundaki kurulum firmasının imzalı ayarını çeker (Authorization: Bearer <kurulum anahtarı>).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const key = process.env.PLATFORM_SIGNING_KEY;
  if (!key) return Response.json({ ok: false, message: 'Merkezde imza anahtarı tanımlı değil.' }, { status: 503 });
  const { slug } = await params;
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'bilinmiyor';
  if (await publicRateLimited(`merkez-ayar:${ip}`, 20)) return Response.json({ ok: false, message: 'Çok fazla istek.' }, { status: 429 });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const bundle = /^[a-z0-9-]{2,40}$/.test(slug) ? await centralBundleFor(await getDb(), slug, token, key) : null;
  if (!bundle) return Response.json({ ok: false, message: 'Kurulum anahtarı geçersiz.' }, { status: 401 });
  return Response.json(bundle, { headers: { 'cache-control': 'no-store' } });
}
