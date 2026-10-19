import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { companies } from '@/core/db/schema';
import { getInstallConfig } from '@/core/install-config';
import { syncFromCentral } from './signed-config';

/** Müşteri sunucusunda: ortam ayarlarıyla merkezden firma ayarını çeker. Ayar yoksa (merkez ya da bulut kurulumu) hiçbir şey yapmaz. */
export async function syncInstallFromCentral(): Promise<{ applied: boolean; reason?: string }> {
  const url = process.env.CENTRAL_CONFIG_URL;
  const token = process.env.CENTRAL_INSTALL_TOKEN;
  const publicKey = process.env.CENTRAL_PUBLIC_KEY;
  if (!url || !token || !publicKey) return { applied: false, reason: 'Merkez bağlantısı tanımlı değil (CENTRAL_CONFIG_URL, CENTRAL_INSTALL_TOKEN, CENTRAL_PUBLIC_KEY).' };
  const slug = getInstallConfig().company.slug;
  const db = await getDb();
  const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, slug));
  if (!c) return { applied: false, reason: `Kurulumda ${slug} firması yok.` };
  return syncFromCentral(db, c.id, { url, token, publicKey, slug });
}
