import { csvResponse, toCsv } from '@/core/export/csv';
import { istanbulToday } from '@/core/dates';
import { resultStatus } from '@/core/http';
import { ORDER_STATUSES } from '@/modules/orders/db/schema';
import { exportOrders } from '@/modules/orders/server/queries';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

export async function GET(req: Request) {
  const durum = new URL(req.url).searchParams.get('durum') ?? '';
  const status = (ORDER_STATUSES as readonly string[]).includes(durum) ? (durum as (typeof ORDER_STATUSES)[number]) : undefined;
  const r = await exportOrders({ status });
  if (!r.ok) return Response.json(r, { status: resultStatus(r) });
  return csvResponse(toCsv(r.data.headers, r.data.rows), `siparisler-${istanbulToday()}.csv`);
}
