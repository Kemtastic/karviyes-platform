import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

// Canlı kurulumda (VPS ve Supabase) uygulama ve göçler süper kullanıcı OLMAYAN bir sahip rolüyle çalışır.
// deploy/db-init/sql/01-roller.sql bu rolleri hazırlar; burada aynı hazırlıkla tüm göçler denenir.
let client: PGlite;
const rows = async <T>(q: string) => (await client.query<T>(q)).rows;

beforeAll(async () => {
  client = new PGlite();
  const { readFileSync } = await import('node:fs');
  await client.exec(readFileSync('deploy/db-init/sql/01-roller.sql', 'utf8').replaceAll(":'uygulama_parolasi'", "'test-parola'"));
  await client.exec('SET ROLE uretim_app');
  await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
});
afterAll(async () => { await client.close(); });

describe('süper kullanıcı olmayan sahip rolü', () => {
  it('rol gerçekten süper kullanıcı değil ve RLS atlayamaz', async () => {
    const [r] = await rows<{ rolsuper: boolean; rolbypassrls: boolean }>(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'uretim_app'`);
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('tüm göçler uygulanır ve tablolar bu role aittir', async () => {
    const [m] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
    expect(m!.n).toBeGreaterThan(20);
    const [owner] = await rows<{ tableowner: string }>(`SELECT tableowner FROM pg_tables WHERE tablename = 'orders'`);
    expect(owner!.tableowner).toBe('uretim_app');
  });

  it('sahip rolü bile firma bağlamı olmadan firma verisini göremez (zorunlu RLS)', async () => {
    await client.exec(`
      RESET ROLE;
      INSERT INTO companies (id, name, slug) VALUES ('00000000-0000-4000-8000-000000000001', 'A', 'a');
      SET app.company_id = '00000000-0000-4000-8000-000000000001';
      INSERT INTO parties (company_id, kind, name, search_key) VALUES ('00000000-0000-4000-8000-000000000001', 'customer', 'Gizli', 'gizli');
      RESET app.company_id;
      SET ROLE uretim_app;
    `);
    expect(await rows(`SELECT * FROM parties`)).toEqual([]);
    await client.exec(`SET app.company_id = '00000000-0000-4000-8000-000000000001'`);
    expect(await rows<{ name: string }>(`SELECT name FROM parties`)).toEqual([{ name: 'Gizli' }]);
  });
});

describe('uygulama bu rolle çalışır', () => {
  it('kurulum komutu, cari oluşturma ve arama', async () => {
    await client.exec('RESET app.company_id; SET ROLE uretim_app;');
    const { schema } = await import('@/core/db/schema');
    const { createAuth } = await import('@/core/auth/auth');
    const { parseInstallConfig } = await import('@/core/install-config');
    const { runSetup } = await import('@/core/setup');
    const { createParty, searchParties } = await import('@/core/parties/service');
    const db = drizzle(client, { schema }) as unknown as import('@/core/db/client').Db;
    const cfg = parseInstallConfig({ company: { name: 'Rol Testi', slug: 'rol' }, modules: ['orders', 'production'], sector: 'bags' });
    const auth = createAuth(db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: 'Test' });
    const setup = await runSetup({ db, auth, cfg, admin: { email: 'yonetici@example.com', name: 'Yönetici', password: 'GucluParola-2026!' }, migrate: async () => {} });
    const user = { userId: 'u', email: 'yonetici@example.com', name: 'Yönetici', companyId: setup.companyId, membershipId: '00000000-0000-0000-0000-000000000000', roles: ['admin' as const], kind: 'person' as const, staffId: null, twoFactorEnabled: true };
    const rt = { user, db, cfg };
    expect(await createParty({ kind: 'customer', name: 'Rol Müşterisi', legalType: 'company' }, rt)).toMatchObject({ ok: true });
    const found = await searchParties({ q: 'rol' }, rt);
    expect(found.ok && found.data.map((p) => p.name)).toEqual(['Rol Müşterisi']);
  });
});
