import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb, dbError, type TestDb } from '../../helpers/db';
import { withCompany, writeAudit } from '@/core/db/scope';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await withCompany(t.companyA, (tx) => writeAudit(tx, { companyId: t.companyA, actorUserId: null, action: 'test', entity: 'x', entityId: '1', after: { a: 1 } }), t.db);
});
afterAll(async () => { await t.close(); });

describe('denetim kaydı değiştirilemez', () => {
  it('uygulama rolü audit kaydını güncelleyemez', async () => {
    expect(await dbError(withCompany(t.companyA, (tx) => tx.execute(sql`update audit_log set action = 'degisti'`), t.db))).toMatch(/permission denied/);
  });

  it('uygulama rolü audit kaydını silemez', async () => {
    expect(await dbError(withCompany(t.companyA, (tx) => tx.execute(sql`delete from audit_log`), t.db))).toMatch(/permission denied/);
  });
});
