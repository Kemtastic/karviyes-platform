import { sql } from 'drizzle-orm';
import type { Db } from '@/core/db/client';

// Kimlik doğrulamasız sağlık kontrolü: yalnızca çalışıyor mu ve veritabanına ulaşıyor mu bilgisi, veri yok.
export async function healthCheck(db: Db): Promise<{ ok: boolean; db: boolean }> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true, db: true };
  } catch {
    return { ok: false, db: false };
  }
}
