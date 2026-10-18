import { istanbulToday } from '@/core/dates';
import { ERROR_STATUS, type AppErrorCode } from '@/core/errors';
import { csvResponse, toCsv } from '@/core/export/csv';
import { financeCsv } from '@/modules/finance/server/reports';

// Ön muhasebe dışa aktarımları: ?tur=faturalar|hareketler|bakiyeler|ekstre|hesap|ba-bs (yetki her sorguda denetlenir).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const r = await financeCsv(params.get('tur') ?? '', params);
  if (!r.ok) return Response.json(r, { status: ERROR_STATUS[r.code as AppErrorCode] ?? 400 });
  return csvResponse(toCsv(r.data.headers, r.data.rows), `${r.data.name}-${istanbulToday()}.csv`);
}
