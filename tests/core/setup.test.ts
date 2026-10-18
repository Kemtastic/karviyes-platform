import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import { schema, companies, memberships } from '@/core/db/schema';
import type { Db } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { createAuth } from '@/core/auth/auth';
import { parseInstallConfig } from '@/core/install-config';
import { runSetup } from '@/core/setup';

let client: PGlite;
let db: Db;
const cfg = parseInstallConfig({ company: { name: 'Karviyes Ambalaj', slug: 'karviyes' }, modules: ['orders', 'production'], sector: 'bags' });
const admin = { email: 'Yonetici@Example.com', name: 'Yönetici', password: 'GucluParola-2026!' };

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as Db;
});
afterAll(async () => { await client.close(); });

const setup = (a = admin) =>
  runSetup({
    db,
    auth: createAuth(db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: cfg.company.name }),
    cfg,
    admin: a,
    migrate: () => migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: 'drizzle' }),
  });

describe('kurulum komutu', () => {
  it('ilk çalıştırmada firma ve yönetici oluşturur', async () => {
    const r = await setup();
    expect(r.created).toBe(true);
    const ms = await withCompany(r.companyId, (tx) => tx.select().from(memberships), db);
    expect(ms).toHaveLength(1);
    expect(ms[0]!.roles).toEqual(['admin']);
  });

  it('ikinci çalıştırma hiçbir şeyi çoğaltmaz', async () => {
    const r = await setup();
    expect(r.created).toBe(false);
    expect(await db.select().from(companies).where(eq(companies.slug, 'karviyes'))).toHaveLength(1);
    expect(await withCompany(r.companyId, (tx) => tx.select().from(memberships), db)).toHaveLength(1);
  });

  it('kısa parolayla yönetici oluşturulmaz', async () => {
    await expect(setup({ ...admin, email: 'baska@example.com', password: 'kisa' })).rejects.toThrow(/12/);
  });
});
