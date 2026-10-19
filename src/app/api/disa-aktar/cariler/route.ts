import { csvResponse, toCsv } from '@/core/export/csv';
import { istanbulToday } from '@/core/dates';
import { resultStatus } from '@/core/http';
import { exportParties } from '@/core/parties/service';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

export async function GET() {
  const r = await exportParties({});
  if (!r.ok) return Response.json(r, { status: resultStatus(r) });
  return csvResponse(toCsv(r.data.headers, r.data.rows), `cariler-${istanbulToday()}.csv`);
}
