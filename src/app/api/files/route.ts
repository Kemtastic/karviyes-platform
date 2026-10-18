import { getCurrentUser } from '@/core/auth/session';
import { resultStatus } from '@/core/http';
import { storeFile } from '@/core/files/service';
import { uploadPrecheck } from '@/core/files/upload';

// Çok parçalı form ile tek dosya yükleme. Tür içerikten belirlenir; boyut sınırı servistedir.
export async function POST(req: Request) {
  const rejected = uploadPrecheck(req, Boolean(await getCurrentUser()));
  if (rejected) return rejected;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ ok: false, code: 'VALIDATION', message: 'Dosya seçin.' }, { status: 400 });
  const result = await storeFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  return Response.json(result, { status: resultStatus(result) });
}
