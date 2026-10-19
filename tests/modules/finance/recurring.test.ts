import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { withCompany } from '@/core/db/scope';
import { finMovements } from '@/modules/finance/db/schema';
import { nextDue } from '@/modules/finance/domain/recurring';
import { createAccount, setPeriodLock } from '@/modules/finance/server/actions';
import { createRecurring, postRecurring, recurringList, setRecurringActive } from '@/modules/finance/server/recurring';

let t: TestDb;
let kasa = '';
const acc = () => ({ ...runtime(t, testUser(t.companyA, ['accounting'])), batch: true });

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  kasa = ok(await createAccount({ kind: 'cash', name: 'Kasa', currency: 'TRY', opening: '100.000', openingDate: '2026-01-01' }, acc())).id;
});
afterAll(async () => { await t.close(); });

describe('tekrarlayan kaydın vadesi', () => {
  const base = { startMonth: '2026-08', endMonth: null, lastPostedMonth: null, dayOfMonth: 5, active: true };
  it('ilk ay başlangıç ayı; sonra son işlenenin ertesi ay; bitiş ayından sonra yok', () => {
    expect(nextDue(base, '2026-10-20')).toEqual({ month: '2026-08', date: '2026-08-05', due: true });
    expect(nextDue({ ...base, lastPostedMonth: '2026-10' }, '2026-10-20')).toEqual({ month: '2026-11', date: '2026-11-05', due: false });
    expect(nextDue({ ...base, lastPostedMonth: '2026-12', dayOfMonth: 28 }, '2027-01-28')).toEqual({ month: '2027-01', date: '2027-01-28', due: true });
    expect(nextDue({ ...base, lastPostedMonth: '2026-09', endMonth: '2026-09' }, '2026-10-20')).toBeNull();
    expect(nextDue({ ...base, active: false }, '2026-10-20')).toBeNull();
  });
});

describe('tekrarlayan kayıt', () => {
  it('işlenince o ayın masrafı KDV ayrılarak kaydedilir; aynı ay ikinci kez ve vadesi gelmemiş ay işlenemez', async () => {
    const r = ok(await createRecurring({ name: 'Depo kirası', accountId: kasa, amount: '12.000', vatRate: '20', category: 'Kira', dayOfMonth: 5, startMonth: '2026-09' }, acc()));
    const first = ok(await postRecurring({ id: r.id, month: '2026-09', version: 1, today: '2026-10-20' }, acc()));
    const [m] = await withCompany(t.companyA, (tx) => tx.select().from(finMovements).where(eq(finMovements.id, first.movementId)), t.db);
    expect(m).toMatchObject({ kind: 'expense', direction: 'out', amountMinor: 1200000n, vatMinor: 200000n, date: '2026-09-05', category: 'Kira' });
    expect(m!.note).toContain('Depo kirası');
    expect(m!.note).toContain('2026-09');
    expect(await postRecurring({ id: r.id, month: '2026-09', version: 2, today: '2026-10-20' }, acc())).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await postRecurring({ id: r.id, month: '2026-11', version: 2, today: '2026-10-20' }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    ok(await postRecurring({ id: r.id, month: '2026-10', version: 2, today: '2026-10-20' }, acc()));
    const list = ok(await recurringList({ today: '2026-10-20' }, acc()));
    expect(list.find((x) => x.id === r.id)).toMatchObject({ lastPostedMonth: '2026-10', next: { month: '2026-11', due: false }, amount: '12.000,00 ₺' });
  });

  it('kilitli döneme işlenemez; pasif kayıt vadeli listede görünmez; başka firmanın kaydı işlenemez', async () => {
    const r = ok(await createRecurring({ name: 'Yazılım aboneliği', accountId: kasa, amount: '500', category: 'Ofis ve kırtasiye', dayOfMonth: 1, startMonth: '2026-07' }, acc()));
    ok(await setPeriodLock({ lockedUntil: '2026-07-31' }, { ...runtime(t, testUser(t.companyA, ['admin'])), batch: true }));
    expect(await postRecurring({ id: r.id, month: '2026-07', version: 1, today: '2026-10-20' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    ok(await setRecurringActive({ id: r.id, version: 1, active: false }, acc()));
    expect(ok(await recurringList({ today: '2026-10-20' }, acc())).find((x) => x.id === r.id)?.next).toBeNull();
    expect(await postRecurring({ id: r.id, month: '2026-08', version: 2, today: '2026-10-20' }, { ...runtime(t, testUser(t.companyB, ['accounting'])), batch: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('hatalı girişler alan hatası verir; satış rolü kayıt açamaz', async () => {
    expect(await createRecurring({ name: 'Kira', accountId: kasa, amount: '0', category: 'Kira', dayOfMonth: 5, startMonth: '2026-09' }, acc())).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String) } });
    expect(await createRecurring({ name: 'Kira', accountId: kasa, amount: '10', category: 'Kira', dayOfMonth: 31, startMonth: '2026-09' }, acc())).toMatchObject({ ok: false, fieldErrors: { dayOfMonth: expect.any(String) } });
    expect(await createRecurring({ name: 'Kira', accountId: kasa, amount: '10', category: 'Kira', dayOfMonth: 5, startMonth: '2026-09', endMonth: '2026-08' }, acc())).toMatchObject({ ok: false, fieldErrors: { endMonth: expect.any(String) } });
    expect(await createRecurring({ name: 'Kira', accountId: kasa, amount: '10', category: 'Kira', dayOfMonth: 5, startMonth: '2026-09' }, { ...runtime(t, testUser(t.companyA, ['sales'])), batch: true })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
