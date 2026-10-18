import { getDb } from '@/core/db/client';
import { healthCheck } from '@/core/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const r = await healthCheck(await getDb());
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
