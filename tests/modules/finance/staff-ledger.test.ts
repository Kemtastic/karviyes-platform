import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { withCompany } from '@/core/db/scope';
import { createStaff } from '@/core/users/service';
import { finMovements } from '@/modules/finance/db/schema';
import { createAccount, reverseMovement, setPeriodLock } from '@/modules/finance/server/actions';
import { recordStaffEntry, reverseStaffEntry, staffBalances, staffLedger } from '@/modules/finance/server/staff-ledger';

let t: TestDb;
let kasa = '';
let ali = '';
let veli = '';
const acc = () => ({ ...runtime(t, testUser(t.companyA, ['accounting'])), batch: true });

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  const admin = { ...runtime(t, testUser(t.companyA, ['admin'])), batch: true };
  kasa = ok(await createAccount({ kind: 'cash', name: 'Kasa', currency: 'TRY', opening: '100.000', openingDate: '2026-01-01' }, acc())).id;
  ali = ok(await createStaff({ name: 'Ali Usta', kind: 'master', departments: [] }, admin)).id;
  veli = ok(await createStaff({ name: 'Veli Operatör', kind: 'operator', departments: [] }, admin)).id;
});
afterAll(async () => { await t.close(); });

describe('personel carisi', () => {
  it('tahakkuk borcu artırır; avans ve ödeme kasadan "Personel" masrafı olarak çıkar ve borcu azaltır', async () => {
    ok(await recordStaffEntry({ staffId: ali, kind: 'accrual', amount: '30.000', date: '2026-09-30', period: '2026-09', note: 'Eylül maaşı' }, acc()));
    const adv = ok(await recordStaffEntry({ staffId: ali, kind: 'advance', amount: '5.000', date: '2026-09-15', accountId: kasa }, acc()));
    ok(await recordStaffEntry({ staffId: ali, kind: 'payment', amount: '20.000', date: '2026-10-05', accountId: kasa }, acc()));
    const [m] = await withCompany(t.companyA, (tx) => tx.select().from(finMovements).where(eq(finMovements.id, adv.movementId!)), t.db);
    expect(m).toMatchObject({ kind: 'expense', direction: 'out', amountMinor: 500000n, vatMinor: 0n, category: 'Personel' });
    expect(m!.note).toContain('Ali Usta');

    const l = ok(await staffLedger({ staffId: ali }, acc()));
    expect(l.rows.map((r) => [r.date, r.kind, r.balance])).toEqual([
      ['2026-09-15', 'advance', '−5.000,00 ₺'],
      ['2026-09-30', 'accrual', '25.000,00 ₺'],
      ['2026-10-05', 'payment', '5.000,00 ₺'],
    ]);
    expect(l.balance).toBe('5.000,00 ₺');
    const all = ok(await staffBalances({}, acc()));
    expect(all.find((s) => s.staffId === ali)).toMatchObject({ name: 'Ali Usta', balance: '5.000,00 ₺', owed: true });
    expect(all.find((s) => s.staffId === veli)).toMatchObject({ balance: '0,00 ₺' });
  });

  it('ödeme hareketi yalnız personel carisinden iptal edilir; iptal hem kaydı hem kasa hareketini geri alır', async () => {
    const p = ok(await recordStaffEntry({ staffId: veli, kind: 'payment', amount: '1.000', date: '2026-10-10', accountId: kasa }, acc()));
    expect(await reverseMovement({ id: p.movementId!, reason: 'Yanlış kişi' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    ok(await reverseStaffEntry({ id: p.id, reason: 'Yanlış kişi' }, acc()));
    const [m] = await withCompany(t.companyA, (tx) => tx.select().from(finMovements).where(eq(finMovements.id, p.movementId!)), t.db);
    expect(m?.reversedAt).not.toBeNull();
    expect(ok(await staffLedger({ staffId: veli }, acc())).balance).toBe('0,00 ₺');
    expect(await reverseStaffEntry({ id: p.id, reason: 'Tekrar' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('ödemede hesap zorunlu; tahakkukta dönem zorunlu; satış rolü ve başka firma göremez', async () => {
    expect(await recordStaffEntry({ staffId: ali, kind: 'payment', amount: '10', date: '2026-10-10' }, acc())).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(String) } });
    expect(await recordStaffEntry({ staffId: ali, kind: 'accrual', amount: '10', date: '2026-10-10' }, acc())).toMatchObject({ ok: false, fieldErrors: { period: expect.any(String) } });
    expect(await staffLedger({ staffId: ali }, { ...runtime(t, testUser(t.companyA, ['sales'])), batch: true })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await staffLedger({ staffId: ali }, { ...runtime(t, testUser(t.companyB, ['accounting'])), batch: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('döviz hesabından personel ödemesi yapılamaz; kilitli döneme ve ileri tarihe tahakkuk girilemez', async () => {
    const usd = ok(await createAccount({ kind: 'bank', name: 'USD banka', currency: 'USD', opening: '10.000', openingDate: '2026-01-01' }, acc())).id;
    expect(await recordStaffEntry({ staffId: ali, kind: 'payment', amount: '100', date: '2026-10-10', accountId: usd }, acc())).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(String) } });
    expect(await recordStaffEntry({ staffId: ali, kind: 'accrual', amount: '100', date: '2099-01-01', period: '2099-01' }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    ok(await setPeriodLock({ lockedUntil: '2026-06-30' }, { ...runtime(t, testUser(t.companyA, ['admin'])), batch: true }));
    expect(await recordStaffEntry({ staffId: ali, kind: 'accrual', amount: '100', date: '2026-06-15', period: '2026-06' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });
});
