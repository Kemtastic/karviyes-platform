import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb, dbError, type TestDb } from '../../helpers/db';
import { withCompany, writeAudit } from '@/core/db/scope';
import { auditLog } from '@/core/db/schema';
import { rowsOf } from '@/core/db/client';

// company_id taşımayan, firmalar arası paylaşılan tablolar (kimlik ve altyapı).
const GLOBAL_TABLES = new Set(['companies', 'user', 'session', 'account', 'verification', 'two_factor', 'rate_limit', 'rate_limits', 'invites', 'platform_admins', 'platform_audit', 'platform_views']);

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

describe('firma kapsamı (RLS)', () => {
  it('A firmasının kaydı B firmasının kapsamında görünmez', async () => {
    await withCompany(t.companyA, (tx) => writeAudit(tx, { companyId: t.companyA, actorUserId: null, action: 'test', entity: 'x', entityId: '1' }), t.db);
    const inB = await withCompany(t.companyB, (tx) => tx.select().from(auditLog), t.db);
    const inA = await withCompany(t.companyA, (tx) => tx.select().from(auditLog), t.db);
    expect(inB).toHaveLength(0);
    expect(inA).toHaveLength(1);
  });

  it('A kapsamında B firmasına kayıt yazılamaz', async () => {
    expect(
      await dbError(withCompany(t.companyA, (tx) => writeAudit(tx, { companyId: t.companyB, actorUserId: null, action: 'test', entity: 'x', entityId: '2' }), t.db)),
    ).toMatch(/row-level security/);
  });

  it('company_id taşıyan her tabloda RLS açık ve zorunlu', async () => {
    const rows = await t.db.execute(sql`
      select c.relname as table_name, c.relrowsecurity as rls, c.relforcerowsecurity as force,
        exists (select 1 from information_schema.columns col where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'company_id') as has_company
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);
    const list = rowsOf<{ table_name: string; rls: boolean; force: boolean; has_company: boolean }>(rows);
    expect(list.length).toBeGreaterThan(1);
    for (const r of list) {
      if (r.has_company) expect({ table: r.table_name, rls: r.rls, force: r.force }).toEqual({ table: r.table_name, rls: true, force: true });
      else expect(GLOBAL_TABLES.has(r.table_name) ? r.table_name : `beklenmeyen paylaşılan tablo: ${r.table_name}`).toBe(r.table_name);
    }
  });
});

describe('Supabase Data API koruması', () => {
  it('istisnasız her tabloda RLS açık (politikası olmayan roller hiçbir satır göremez)', async () => {
    const rows = rowsOf<{ table_name: string; rls: boolean }>(await t.db.execute(sql`
      select c.relname as table_name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`));
    expect(rows.filter((r) => !r.rls).map((r) => r.table_name)).toEqual([]);
  });
});

describe('Supabase anon rolü', () => {
  it('varsayılan yetki verilmiş anon rolü bile kullanıcı ve oturum tablolarını okuyamaz', async () => {
    await t.db.execute(sql`create role anon nologin`);
    await t.db.execute(sql`grant usage on schema public to anon`);
    await t.db.execute(sql`grant select on all tables in schema public to anon`);
    await t.db.execute(sql`select app_secure_tables()`);
    const read = (table: string) => dbError(t.db.transaction(async (tx) => { await tx.execute(sql`set local role anon`); await tx.execute(sql.raw(`select * from "${table}"`)); }));
    expect(await read('user')).toMatch(/permission denied/);
    expect(await read('session')).toMatch(/permission denied/);
    expect(await read('orders')).toMatch(/permission denied/);
  });
});
