import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb, dbError, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { withCompany } from '@/core/db/scope';
import { createParty } from '@/core/parties/service';

let t: TestDb;
let partyB: string;
beforeAll(async () => {
  t = await createTestDb();
  const p = await createParty({ kind: 'customer', name: 'B Müşterisi', legalType: 'company' }, runtime(t, testUser(t.companyB, ['admin'])));
  if (!p.ok) throw new Error(p.message);
  partyB = p.data.id;
});
afterAll(async () => { await t.close(); });

const insertOrder = (companyId: string, partyId: string, extra = '') =>
  withCompany(companyId, (tx) => tx.execute(sql.raw(`insert into orders (company_id, no, party_id, order_date, product, quantity, unit_price, vat_rate, currency, total_minor, packaging, department_notes, created_by${extra ? ', status' : ''})
    values ('${companyId}', 'S-TEST-${Math.random()}', '${partyId}', '2026-10-18', '{}', 1, 1, 10, 'TRY', 110, '{}', '{}', 'test'${extra ? `, '${extra}'` : ''})`)), t.db);

describe('veri bütünlüğü', () => {
  it('var olmayan cariye sipariş yazılamaz', async () => {
    expect(await dbError(insertOrder(t.companyA, '00000000-0000-4000-8000-000000000000'))).toMatch(/foreign key/);
  });

  it('başka firmanın carisine bağlı sipariş yazılamaz (firma+kayıt yabancı anahtarı)', async () => {
    expect(await dbError(insertOrder(t.companyA, partyB))).toMatch(/foreign key/);
  });

  it('geçersiz durum değeri reddedilir', async () => {
    expect(await dbError(insertOrder(t.companyB, partyB, 'uydurma'))).toMatch(/check constraint/);
  });
});
