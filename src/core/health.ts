import { sql } from 'drizzle-orm';
import type { Db } from '@/core/db/client';
import { getInstallConfig } from '@/core/install-config';

// Kimlik doğrulamasız sağlık kontrolü: yalnızca çalışıyor mu, veritabanına ulaşıyor mu ve kurulum ayarı okunuyor mu; veri yok.
// Ayar okunamazsa giriş sistemi açılamaz (ör. Vercel'de INSTALL_CONFIG_JSON eksik); bunu burada açıkça göstermek gerekir.
export async function healthCheck(db: Db, checkConfig: () => unknown = getInstallConfig): Promise<{ ok: boolean; db: boolean; config: boolean }> {
  let config = true;
  try {
    checkConfig();
  } catch {
    config = false;
  }
  try {
    await db.execute(sql`select 1`);
    return { ok: config, db: true, config };
  } catch {
    return { ok: false, db: false, config };
  }
}
