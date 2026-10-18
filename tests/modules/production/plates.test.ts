import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createPlate, listPlates } from '@/modules/production/server/plates';

let t: TestDb;
let partyId: string;
beforeAll(async () => {
  t = await createTestDb();
  const p = await createParty({ kind: 'customer', name: 'Örnek Kırtasiye', legalType: 'company' }, runtime(t, testUser(t.companyA, ['admin'])));
  if (!p.ok) throw new Error(p.message);
  partyId = p.data.id;
});
afterAll(async () => { await t.close(); });

describe('klişeler', () => {
  it('klişe müşteriyle kaydedilir ve listelenir', async () => {
    const r = await createPlate({ partyId, name: 'Logo ön yüz', colours: 'siyah · kırmızı', notes: '' }, runtime(t, testUser(t.companyA, ['tracking'])));
    expect(r).toMatchObject({ ok: true });
    const list = await listPlates({}, runtime(t, testUser(t.companyA, ['sales'])));
    expect(list.ok && list.data.map((p) => [p.name, p.partyName])).toEqual([['Logo ön yüz', 'Örnek Kırtasiye']]);
  });

  it('başka firma klişeyi görmez', async () => {
    const list = await listPlates({}, runtime(t, testUser(t.companyB, ['sales'])));
    expect(list.ok && list.data).toEqual([]);
  });

  it('bölüm tableti klişe ekleyemez', async () => {
    expect(await createPlate({ partyId, name: 'X', colours: '', notes: '' }, runtime(t, testUser(t.companyA, ['printing'], { kind: 'device' })))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
