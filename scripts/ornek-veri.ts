import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createAuth } from '@/core/auth/auth';
import { getDb } from '@/core/db/client';
import { companies } from '@/core/db/schema';
import { getEnv } from '@/core/env';
import { getInstallConfig } from '@/core/install-config';
import { seedSampleData } from '@/seed/sample-data';

const env = getEnv();
const cfg = getInstallConfig();
const db = await getDb();
const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, cfg.company.slug));
if (!company) throw new Error('Firma yok; önce "pnpm kurulum" çalıştırın.');
const tabletPassword = process.env.ORNEK_TABLET_PAROLA || randomBytes(9).toString('base64url');
const r = await seedSampleData({ db, companyId: company.id, cfg, auth: createAuth(db, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, issuer: cfg.company.name }), tabletPassword });
if (!r.created) console.log('Örnek veri zaten yüklü; değişiklik yapılmadı.');
else {
  console.log('Örnek veri yüklendi. Bölüm tableti girişleri (parola bir kez gösterilir):');
  for (const t of r.tablets) console.log(`  ${t.role.padEnd(10)} ${t.loginEmail}`);
  console.log(`  Parola: ${tabletPassword}`);
}
process.exit(0);
