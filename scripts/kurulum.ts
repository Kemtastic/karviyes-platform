import { createAuth } from '@/core/auth/auth';
import { getDb, migrateDb } from '@/core/db/client';
import { getEnv } from '@/core/env';
import { getInstallConfig } from '@/core/install-config';
import { runSetup } from '@/core/setup';

const env = getEnv();
const cfg = getInstallConfig();
const email = process.env.KURULUM_ADMIN_EMAIL;
const name = process.env.KURULUM_ADMIN_NAME ?? 'Yönetici';
const password = process.env.KURULUM_ADMIN_PASSWORD ?? '';
if (!email) throw new Error('KURULUM_ADMIN_EMAIL tanımlı değil.');

const db = await getDb();
const result = await runSetup({
  db,
  auth: createAuth(db, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, issuer: cfg.company.name }),
  cfg,
  admin: { email, name, password },
  migrate: () => migrateDb(db, env.DATABASE_URL),
});
console.log(result.created ? `Kurulum tamam. Yönetici oluşturuldu: ${email}` : 'Kurulum tamam. Mevcut kayıtlar korundu.');
process.exit(0);
