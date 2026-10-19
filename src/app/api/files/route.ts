import { getCurrentUser } from '@/core/auth/session';
import { resultStatus } from '@/core/http';
import { storeFile } from '@/core/files/service';
import { readBodyCapped, uploadPrecheck } from '@/core/files/upload';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

// Çok parçalı form ile tek dosya yükleme. Tür içerikten belirlenir; boyut sınırı servistedir.
export async function POST(req: Request) {
  const rejected = uploadPrecheck(req, Boolean(await getCurrentUser()));
  if (rejected) return rejected;
  const body = await readBodyCapped(req);
  if (!body) return Response.json({ ok: false, code: 'VALIDATION', message: 'Dosya en fazla 10 MB olabilir.' }, { status: 413 });
  const form = await new Response(body as Uint8Array<ArrayBuffer>, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ ok: false, code: 'VALIDATION', message: 'Dosya seçin.' }, { status: 400 });
  const result = await storeFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  return Response.json(result, { status: resultStatus(result) });
}
