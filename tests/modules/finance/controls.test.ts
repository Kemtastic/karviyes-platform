import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import {
  cancelInvoice, createAccount, endorseCheck, receiveCheck, recordExpense, recordInvoice, recordPayment, returnCheck, setPeriodLock, transfer,
} from '@/modules/finance/server/actions';
import { invoicesList, partyBalances, partyLedger, vatSummary } from '@/modules/finance/server/queries';

let t: TestDb;
const acc = () => runtime(t, testUser(t.companyA, ['accounting']));
const admin = () => runtime(t, testUser(t.companyA, ['admin']));
const ids: Record<string, string> = {};

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}
const balance = async (partyId: string) => ok(await partyBalances({}, acc())).find((b) => b.partyId === partyId && b.currency === 'TRY')?.balance;

beforeAll(async () => {
  t = await createTestDb();
  ids.musteri = ok(await createParty({ kind: 'customer', name: 'Kontrol Müşterisi', legalType: 'company' }, admin())).id;
  ids.tedarikci = ok(await createParty({ kind: 'supplier', name: 'Kontrol Tedarikçisi', legalType: 'company' }, admin())).id;
  ids.kasa = ok(await createAccount({ kind: 'cash', name: 'Kasa', currency: 'TRY', opening: '1.000', openingDate: '2026-01-01' }, acc())).id;
  ids.banka = ok(await createAccount({ kind: 'bank', name: 'Banka', currency: 'TRY', opening: '0', openingDate: '2026-01-01' }, acc())).id;
});
afterAll(async () => { await t.close(); });

describe('kasa eksiye düşmez', () => {
  it('kasadan bakiyeyi aşan ödeme, masraf ve virman reddedilir; banka eksiye düşebilir', async () => {
    expect(await recordPayment({ kind: 'payment', partyId: ids.tedarikci, accountId: ids.kasa, amount: '1.000,01', date: '2026-09-01' }, acc())).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(String) } });
    expect(await recordExpense({ accountId: ids.kasa, amount: '2.000', category: 'Diğer', date: '2026-09-01' }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await transfer({ fromAccountId: ids.kasa, toAccountId: ids.banka, amount: '5.000', date: '2026-09-01' }, acc())).toMatchObject({ ok: false, fieldErrors: { fromAccountId: expect.any(String) } });
    ok(await recordPayment({ kind: 'payment', partyId: ids.tedarikci, accountId: ids.kasa, amount: '1.000', date: '2026-09-01' }, acc()));
    ok(await recordExpense({ accountId: ids.banka, amount: '500', category: 'Banka masrafı', date: '2026-09-01' }, acc()));
  });
});

describe('iade faturası ve KDV özeti', () => {
  it('satış iadesi müşteri bakiyesini düşürür; KDV tam, tevkifat ayrı; masraf KDV indirilecekte', async () => {
    ok(await recordInvoice({ kind: 'sales', partyId: ids.musteri, docNo: 'S-1', date: '2026-09-05', currency: 'TRY', base: '10.000', vatRate: 20, withholding: 5 }, acc()));
    ok(await recordInvoice({ kind: 'sales_return', partyId: ids.musteri, docNo: 'SI-1', date: '2026-09-06', currency: 'TRY', base: '1.000', vatRate: 20 }, acc()));
    expect(await balance(ids.musteri!)).toBe('980000');
    ok(await recordInvoice({ kind: 'purchase', partyId: ids.tedarikci, docNo: 'A-1', date: '2026-09-07', currency: 'TRY', base: '5.000', vatRate: 20, withholding: 5 }, acc()));
    ok(await recordInvoice({ kind: 'purchase_return', partyId: ids.tedarikci, docNo: 'AI-1', date: '2026-09-08', currency: 'TRY', base: '500', vatRate: 20 }, acc()));
    ok(await recordExpense({ accountId: ids.banka, amount: '1.200', vatRate: 20, category: 'Kira', date: '2026-09-09' }, acc()));
    expect(await recordInvoice({ kind: 'sales_return', partyId: ids.tedarikci, docNo: 'X', date: '2026-09-08', currency: 'TRY', base: '1', vatRate: 20 }, acc())).toMatchObject({ ok: false, fieldErrors: { partyId: expect.any(String) } });
    const v = ok(await vatSummary({ month: '2026-09' }, acc())).rows[0]!;
    // Hesaplanan: 2.000 − 200 iade; satışta tevkif edilen 1.000 ayrı
    expect(v).toMatchObject({ output: '180000', salesWithholding: '100000' });
    // İndirilecek: alış 1.000 − iade 100 + masraf 200 = 1.100; sorumlu sıfatıyla 500
    expect(v).toMatchObject({ purchaseVat: '90000', expenseVat: '20000', deductible: '110000', responsible: '50000', difference: '70000' });
  });
});

describe('dönem kilidi', () => {
  it('kilitli döneme kayıt ve iptal yapılamaz; kilidi geri almak yalnız yöneticinin', async () => {
    ok(await setPeriodLock({ lockedUntil: '2026-09-30' }, acc()));
    expect(await recordInvoice({ kind: 'sales', partyId: ids.musteri, docNo: 'S-2', date: '2026-09-15', currency: 'TRY', base: '100', vatRate: 20 }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE', fieldErrors: { date: expect.any(String) } });
    const ledger = ok(await partyLedger({ partyId: ids.musteri! }, acc()));
    const inv = ledger.currencies[0]!.rows.find((r) => r.text.includes('S-1'))!;
    expect(await cancelInvoice({ id: inv.id, reason: 'deneme' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    ok(await recordInvoice({ kind: 'sales', partyId: ids.musteri, docNo: 'S-3', date: '2026-10-01', currency: 'TRY', base: '100', vatRate: 20 }, acc()));
    expect(await setPeriodLock({ lockedUntil: '2026-08-31' }, acc())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await setPeriodLock({ lockedUntil: '2999-01-01' }, admin())).toMatchObject({ ok: false, code: 'VALIDATION' });
    ok(await setPeriodLock({ lockedUntil: null }, admin()));
  });
});

describe('karşılıksız çek', () => {
  it('portföydeki çek karşılıksız: ekstrede alış ve ters kayıt birlikte görünür', async () => {
    const before = await balance(ids.musteri!);
    const c = ok(await receiveCheck({ partyId: ids.musteri, checkNo: '77', bank: 'Garanti', date: '2026-10-02', due: '2026-12-01', amount: '1.000', currency: 'TRY' }, acc()));
    ok(await returnCheck({ id: c.id, version: 1, reason: 'Karşılıksız' }, acc()));
    expect(await balance(ids.musteri!)).toBe(before);
    const rows = ok(await partyLedger({ partyId: ids.musteri! }, acc())).currencies[0]!.rows.filter((r) => r.text.includes('Garanti 77'));
    expect(rows.map((r) => [r.credit, r.debit])).toEqual([['100000', '0'], ['0', '100000']]);
  });

  it('ciro edilen çek karşılıksız döndü: hem müşterinin hem tedarikçinin borcu geri gelir', async () => {
    const m0 = BigInt((await balance(ids.musteri!))!);
    const t0 = BigInt((await balance(ids.tedarikci!)) ?? '0');
    const c = ok(await receiveCheck({ partyId: ids.musteri, checkNo: '88', bank: 'Akbank', date: '2026-10-03', due: '2026-12-01', amount: '2.000', currency: 'TRY' }, acc()));
    ok(await endorseCheck({ id: c.id, version: 1, partyId: ids.tedarikci, date: '2026-10-04' }, acc()));
    expect(BigInt((await balance(ids.tedarikci!))!)).toBe(t0 + 200000n);
    ok(await returnCheck({ id: c.id, version: 2, reason: 'Ciro edilen çek karşılıksız' }, acc()));
    expect(BigInt((await balance(ids.musteri!))!)).toBe(m0);
    expect(BigInt((await balance(ids.tedarikci!))!)).toBe(t0);
  });
});

describe('karışık oranlı fatura', () => {
  it('oran satırları ayrı hesaplanır, tevkifat toplam KDV üzerinden; KDV özeti oran kırılımı verir', async () => {
    const r = ok(await recordInvoice({
      kind: 'sales', partyId: ids.musteri, docNo: 'KO-1', date: '2026-10-12', currency: 'TRY',
      lines: [{ base: '1.000', vatRate: 20 }, { base: '500', vatRate: 10 }, { base: '200', vatRate: 1 }],
    }, acc()));
    // KDV: 200 + 50 + 2 = 252; toplam 1.952
    expect(r.total).toBe('195200');
    const inv = ok(await invoicesList({ kind: 'sales', from: '2026-10-12' }, acc())).find((f) => f.docNo === 'KO-1')!;
    expect(inv).toMatchObject({ base: '170000', vat: '25200', rates: [{ rate: '20', base: '100000', vat: '20000' }, { rate: '10', base: '50000', vat: '5000' }, { rate: '1', base: '20000', vat: '200' }] });
    const v = ok(await vatSummary({ month: '2026-10' }, acc())).rows[0]!;
    expect(v.byRate).toEqual(expect.arrayContaining([{ side: 'sales', rate: '10', base: '50000', vat: '5000' }]));
  });

  it("e-Faturadaki KDV 1 TL'ye kadar farkla elle girilebilir; daha fazlası reddedilir", async () => {
    ok(await recordInvoice({ kind: 'purchase', partyId: ids.tedarikci, docNo: 'KO-2', date: '2026-10-13', currency: 'TRY', lines: [{ base: '333,33', vatRate: 20, vat: '66,67' }] }, acc()));
    expect(await recordInvoice({ kind: 'purchase', partyId: ids.tedarikci, docNo: 'KO-3', date: '2026-10-13', currency: 'TRY', lines: [{ base: '333,33', vatRate: 20, vat: '70' }] }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await recordInvoice({ kind: 'purchase', partyId: ids.tedarikci, docNo: 'KO-4', date: '2026-10-13', currency: 'TRY' }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });
});
