import { istanbulToday } from '@/core/dates';
import { ERROR_STATUS, type AppErrorCode } from '@/core/errors';
import { exportCompanyData } from '@/core/platform/export';

export const preferredRegion = 'fra1';

// Merkez panel: firmanın bütün verisi tek JSON dosyası (yetki ve kayıt eylemin içinde).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await exportCompanyData({ companyId: id });
  if (!r.ok) return Response.json(r, { status: ERROR_STATUS[r.code as AppErrorCode] ?? 400 });
  const slug = String(r.data.company.slug ?? 'firma');
  return new Response(JSON.stringify(r.data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${slug}-veri-${istanbulToday()}.json"`,
      'cache-control': 'no-store',
    },
  });
}
