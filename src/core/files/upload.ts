import type { AppErrorCode } from '@/core/errors';
import { MAX_FILE_BYTES } from './service';

// Çok parçalı form başlığı ve sınırlar için pay.
const FORM_OVERHEAD = 64 * 1024;

const fail = (status: number, code: AppErrorCode, message: string) => Response.json({ ok: false, code, message }, { status });

// Yükleme isteğini gövdeyi okumadan eler: kaynak, oturum ve bildirilen boyut.
export function uploadPrecheck(req: Request, hasSession: boolean): Response | null {
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host) return fail(403, 'FORBIDDEN', 'İzin verilmeyen kaynak.');
  if (!hasSession) return fail(401, 'UNAUTHENTICATED', 'Oturum açın.');
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_FILE_BYTES + FORM_OVERHEAD) return fail(413, 'VALIDATION', 'Dosya en fazla 10 MB olabilir.');
  return null;
}

export const UPLOAD_BODY_LIMIT = MAX_FILE_BYTES + FORM_OVERHEAD;

// Gövdeyi en çok `limit` bayt okur; aşılırsa okumayı keser ve null döner.
// Boyutu bildirilmeyen (HTTP/2, parçalı) isteklerde bellek sınırsız dolmasın diye.
export async function readBodyCapped(req: Request, limit = UPLOAD_BODY_LIMIT): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
