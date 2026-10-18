import { resultStatus } from '@/core/http';
import { storeFile } from '@/core/files/service';

// Çok parçalı form ile tek dosya yükleme. Tür içerikten belirlenir; boyut sınırı servistedir.
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host) {
    return Response.json({ ok: false, code: 'FORBIDDEN', message: 'İzin verilmeyen kaynak.' }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ ok: false, code: 'VALIDATION', message: 'Dosya seçin.' }, { status: 400 });
  const result = await storeFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  return Response.json(result, { status: resultStatus(result) });
}
