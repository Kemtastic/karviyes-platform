import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { updateCompanyProfile } from '@/core/company/profile';
import { withCompany } from '@/core/db/scope';
import { finReconciliations } from '@/modules/finance/db/schema';
import { eq as eqOp } from 'drizzle-orm';
import { createAccount, recordInvoice, recordPayment } from '@/modules/finance/server/actions';
import {
  answerReconciliation, cancelReconciliation, createReconciliation, issueReconciliationLink, makeToken, parseToken, publicReconciliation, reconciliationDetail, recordReconciliationAnswer,
} from '@/modules/finance/server/reconciliation';

let t: TestDb;
const acc = () => runtime(t, testUser(t.companyA, ['accounting']));
let party = '';

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}
const tokenOf = (link: string) => link.split('/mutabakat/')[1]!;

beforeAll(async () => {
  t = await createTestDb();
  party = ok(await createParty({ kind: 'customer', name: 'Mutabakat Müşterisi', legalType: 'company' }, runtime(t, testUser(t.companyA, ['admin'])))).id;
  const bank = ok(await createAccount({ kind: 'bank', name: 'Banka', currency: 'TRY', openingDate: '2026-01-01' }, acc())).id;
  ok(await recordInvoice({ kind: 'sales', partyId: party, docNo: 'M-1', date: '2026-09-01', currency: 'TRY', base: '1.000', vatRate: 20 }, acc()));
  ok(await recordPayment({ kind: 'collection', partyId: party, accountId: bank, amount: '200', date: '2026-09-10' }, acc()));
  // Mutabakat tarihinden sonraki hareket bakiyeye girmez.
  ok(await recordInvoice({ kind: 'sales', partyId: party, docNo: 'M-2', date: '2026-10-05', currency: 'TRY', base: '500', vatRate: 0 }, acc()));
});
afterAll(async () => { await t.close(); });

describe('bağlantı', () => {
  it('belirteç biçimi ayrıştırılır; bozuk belirteç reddedilir', () => {
    const { token } = makeToken('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
    expect(parseToken(token)).toMatchObject({ companyId: '11111111-1111-4111-8111-111111111111' });
    expect(parseToken('x~y~z')).toBeNull();
    expect(parseToken(`${token}a`)).toBeNull();
  });
});

describe('mutabakat akışı', () => {
  it('tarih itibarıyla bakiye dondurulur, bağlantıyla karşı taraf görür ve bir kez cevaplar', async () => {
    const r = ok(await createReconciliation({ partyId: party, currency: 'TRY', asOf: '2026-09-30', email: 'muhasebe@example.com', contactName: 'Ayşe Hanım' }, acc()));
    expect(r.no).toBe('MUT-20260930-001');
    expect(r.balance).toBe('100000');
    expect(await publicReconciliation('bozuk', t.db)).toBeNull();

    const link = ok(await issueReconciliationLink({ id: r.id, version: 1 }, acc()));
    expect(typeof link.mailed).toBe('boolean');
    const token = tokenOf(link.link);
    const seen = await publicReconciliation(token, t.db);
    expect(seen).toMatchObject({ partyName: 'Mutabakat Müşterisi', balance: '100000', status: 'pending' });
    expect(seen!.rows).toHaveLength(2);

    // Gizli anahtarın bir harfi değişirse görülemez.
    const forged = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(await publicReconciliation(forged, t.db)).toBeNull();

    expect(await answerReconciliation(token, { status: 'disputed', name: 'Ayşe' }, t.db)).toMatchObject({ ok: false, fieldErrors: { note: expect.any(String) } });
    expect(await answerReconciliation(token, { status: 'disputed', name: 'Ayşe', note: 'Bizde 900 TL görünüyor', counterBalance: '900,00' }, t.db)).toEqual({ ok: true });
    expect(await answerReconciliation(token, { status: 'agreed', name: 'Başkası' }, t.db)).toMatchObject({ ok: false });
    const d = ok(await reconciliationDetail({ id: r.id }, acc()));
    expect(d).toMatchObject({ status: 'disputed', response: { name: 'Ayşe', counterBalance: '90000', external: false } });
    expect(await issueReconciliationLink({ id: r.id, version: d.version }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('yeni bağlantı eskisini geçersiz kılar; iptal bağlantıyı kapatır', async () => {
    const r = ok(await createReconciliation({ partyId: party, currency: 'TRY', asOf: '2026-10-10' }, acc()));
    expect(r.balance).toBe('150000');
    const first = tokenOf(ok(await issueReconciliationLink({ id: r.id, version: 1, send: false }, acc())).link);
    const second = tokenOf(ok(await issueReconciliationLink({ id: r.id, version: 2, send: false }, acc())).link);
    expect(await publicReconciliation(first, t.db)).toBeNull();
    expect(await publicReconciliation(second, t.db)).not.toBeNull();
    ok(await cancelReconciliation({ id: r.id, version: 3, reason: 'Yanlış tarih' }, acc()));
    expect(await publicReconciliation(second, t.db)).toBeNull();
  });

  it('başka firmanın kimliğiyle kurulmuş belirteç kaydı bulamaz', async () => {
    const r = ok(await createReconciliation({ partyId: party, currency: 'TRY', asOf: '2026-10-01' }, acc()));
    const token = tokenOf(ok(await issueReconciliationLink({ id: r.id, version: 1, send: false }, acc())).link);
    const swapped = token.replace(t.companyA, t.companyB);
    expect(await publicReconciliation(swapped, t.db)).toBeNull();
  });

  it('sistem dışı cevap kaydedilir; ileri tarihli mutabakat açılamaz; satış rolü erişemez', async () => {
    const r = ok(await createReconciliation({ partyId: party, currency: 'TRY', asOf: '2026-10-02' }, acc()));
    ok(await recordReconciliationAnswer({ id: r.id, version: 1, status: 'agreed', name: 'Telefonla teyit' }, acc()));
    expect(ok(await reconciliationDetail({ id: r.id }, acc()))).toMatchObject({ status: 'agreed', response: { external: true } });
    expect(await createReconciliation({ partyId: party, currency: 'TRY', asOf: '2999-01-01' }, acc())).toMatchObject({ ok: false, fieldErrors: { asOf: expect.any(String) } });
    expect(await createReconciliation({ partyId: party, currency: 'TRY', asOf: '2026-10-01' }, runtime(t, testUser(t.companyA, ['sales'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('mutabakat antetinde firma bilgisi', () => {
  it('firma profili mutabakat anında kayda geçer (unvan, vergi dairesi ve no, adres)', async () => {
    ok(await updateCompanyProfile({ legalName: 'Firma A Ambalaj A.Ş.', taxOffice: 'Kozyatağı', taxNumber: '1234567890', address: 'OSB 3. Cadde No:5', city: 'İstanbul' }, { ...runtime(t, testUser(t.companyA, ['admin'])), batch: true }));
    const r = ok(await createReconciliation({ partyId: party, currency: 'TRY', asOf: '2026-10-03' }, acc()));
    const [row] = await withCompany(t.companyA, (tx) => tx.select().from(finReconciliations).where(eqOp(finReconciliations.id, r.id)), t.db);
    expect(row!.snapshot.companyInfo).toBe('Firma A Ambalaj A.Ş. · Kozyatağı V.D. 1234567890 · OSB 3. Cadde No:5 İstanbul');
  });
});
