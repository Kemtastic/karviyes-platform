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
