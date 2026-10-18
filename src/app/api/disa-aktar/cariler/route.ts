import { csvResponse, toCsv } from '@/core/export/csv';
import { istanbulToday } from '@/core/dates';
import { resultStatus } from '@/core/http';
import { exportParties } from '@/core/parties/service';

export async function GET() {
  const r = await exportParties({});
  if (!r.ok) return Response.json(r, { status: resultStatus(r) });
  return csvResponse(toCsv(r.data.headers, r.data.rows), `cariler-${istanbulToday()}.csv`);
}
