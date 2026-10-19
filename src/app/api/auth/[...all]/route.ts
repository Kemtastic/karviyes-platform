import { getAuth } from '@/core/auth/session';

// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

export async function GET(req: Request) {
  return (await getAuth()).handler(req);
}

export async function POST(req: Request) {
  return (await getAuth()).handler(req);
}
