import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testConfig, testUser } from '../../helpers/runtime';
import { parseInstallConfig } from '@/core/install-config';
import { createParty } from '@/core/parties/service';
import {
  archiveAccount, cancelInvoice, createAccount, endorseCheck, issueCheck, receiveCheck, recordExpense, recordInvoice, recordPayment, returnCheck, reverseMovement, setOpening, settleCheck, transfer,
} from '@/modules/finance/server/actions';
import { accountStatement, accountsList, checksList, financeOverview, invoicesList, partyBalances, partyLedger } from '@/modules/finance/server/queries';

let t: TestDb;
const acc = () => runtime(t, testUser(t.companyA, ['accounting']));
const other = () => runtime(t, testUser(t.companyB, ['admin']));
const ids: Record<string, string> = {};

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

const balanceOf = async (account: string) => ok(await accountsList({}, acc())).find((a) => a.id === account)!.balance;
const partyBalance = async (partyId: string, currency = 'TRY') => ok(await partyBalances({}, acc())).find((b) => b.partyId === partyId && b.currency === currency)?.balance;

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  for (const [key, kind] of [['musteri', 'customer'], ['tedarikci', 'supplier'], ['ikisi', 'both']] as const) {
    ids[key] = ok(await createParty({ kind, name: `Cari ${key}`, legalType: 'company' }, admin)).id;
  }
  ids.kasa = ok(await createAccount({ kind: 'cash', name: 'Merkez kasa', currency: 'TRY', opening: '1.000,00', openingDate: '2026-01-01' }, acc())).id;
  ids.banka = ok(await createAccount({ kind: 'bank', name: 'Ziraat', currency: 'TRY', opening: '0', openingDate: '2026-01-01', bank: 'Ziraat', iban: 'TR33 0006 1005 1978 6457 8413 26' }, acc())).id;
  ids.usd = ok(await createAccount({ kind: 'bank', name: 'Dolar hesabı', currency: 'USD', openingDate: '2026-01-01' }, acc())).id;
});
afterAll(async () => { await t.close(); });

describe('yetki ve modül', () => {
  it('satış ve bölüm rolleri ön muhasebeye erişemez; modül kapalıysa reddedilir', async () => {
    expect(await accountsList({}, runtime(t, testUser(t.companyA, ['sales'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const cfg = parseInstallConfig({ company: { name: 'X', slug: 'x' }, modules: ['orders'], sector: 'bags' });
    expect(await accountsList({}, { ...acc(), cfg })).toMatchObject({ ok: false, code: 'MODULE_DISABLED' });
    expect(testConfig.modules).toContain('finance');
  });

  it('başka firma hesapları, faturaları ve cari bakiyeleri görmez; başka firmanın carisine fatura işleyemez', async () => {
    expect(ok(await accountsList({}, other()))).toEqual([]);
    const r = await recordInvoice({ kind: 'sales', partyId: ids.musteri, docNo: 'X1', date: '2026-10-01', currency: 'TRY', base: '100', vatRate: 20 }, other());
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' });
  });
});

describe('hesaplar', () => {
  it('IBAN biçimi ve para birimi denetlenir', async () => {
    expect(await createAccount({ kind: 'bank', name: 'Hatalı', currency: 'TRY', openingDate: '2026-01-01', iban: 'TR12' }, acc())).toMatchObject({ ok: false, fieldErrors: { iban: expect.any(String) } });
    expect(await createAccount({ kind: 'bank', name: 'Hatalı', currency: 'GBP', openingDate: '2026-01-01' }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await balanceOf(ids.kasa!)).toBe('100000');
  });
});

describe('fatura kaydı', () => {
  it('KDV ve tevkifat hesaplanır; aynı numara aynı cariye iki kez işlenmez', async () => {
    const f = ok(await recordInvoice({ kind: 'sales', partyId: ids.musteri, docNo: 'GIB2026000001', date: '2026-09-01', due: '2026-09-30', currency: 'TRY', base: '10.000,00', vatRate: 20 }, acc()));
    expect(f.total).toBe('1200000');
    expect(await recordInvoice({ kind: 'sales', partyId: ids.musteri, docNo: 'GIB2026000001', date: '2026-09-02', currency: 'TRY', base: '1', vatRate: 20 }, acc())).toMatchObject({ ok: false, code: 'CONFLICT' });
    const tev = ok(await recordInvoice({ kind: 'purchase', partyId: ids.tedarikci, docNo: 'A-77', date: '2026-10-01', due: '2026-11-01', currency: 'TRY', base: '1.000', vatRate: 20, withholding: 5 }, acc()));
    expect(tev.total).toBe('110000');
  });

  it('satış faturası tedarikçiye, alış faturası yalnız müşteriye işlenmez; vade tarihten önce olamaz; ileri tarih reddedilir', async () => {
    expect(await recordInvoice({ kind: 'sales', partyId: ids.tedarikci, docNo: 'S1', date: '2026-10-01', currency: 'TRY', base: '100', vatRate: 20 }, acc())).toMatchObject({ ok: false, fieldErrors: { partyId: expect.any(String) } });
    expect(await recordInvoice({ kind: 'purchase', partyId: ids.musteri, docNo: 'P1', date: '2026-10-01', currency: 'TRY', base: '100', vatRate: 20 }, acc())).toMatchObject({ ok: false, fieldErrors: { partyId: expect.any(String) } });
    expect(await recordInvoice({ kind: 'sales', partyId: ids.ikisi, docNo: 'S2', date: '2026-10-01', due: '2026-09-01', currency: 'TRY', base: '100', vatRate: 20 }, acc())).toMatchObject({ ok: false, fieldErrors: { due: expect.any(String) } });
    expect(await recordInvoice({ kind: 'sales', partyId: ids.ikisi, docNo: 'S3', date: '2999-01-01', currency: 'TRY', base: '100', vatRate: 20 }, acc())).toMatchObject({ ok: false, fieldErrors: { date: expect.any(String) } });
    expect(await recordInvoice({ kind: 'sales', partyId: ids.ikisi, docNo: 'S4', date: '2026-10-01', currency: 'TRY', base: '0', vatRate: 20 }, acc())).toMatchObject({ ok: false, fieldErrors: { base: expect.any(String) } });
  });

  it('iptal edilen fatura bakiyeden düşer, numarası yeniden kullanılabilir', async () => {
    const f = ok(await recordInvoice({ kind: 'sales', partyId: ids.ikisi, docNo: 'IPT-1', date: '2026-10-01', currency: 'TRY', base: '500', vatRate: 0 }, acc()));
    expect(await partyBalance(ids.ikisi!)).toBe('50000');
    ok(await cancelInvoice({ id: f.id, reason: 'Yanlış cari' }, acc()));
    expect(await cancelInvoice({ id: f.id, reason: 'tekrar' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect((await partyBalance(ids.ikisi!)) ?? '0').toBe('0');
    ok(await recordInvoice({ kind: 'sales', partyId: ids.ikisi, docNo: 'IPT-1', date: '2026-10-01', currency: 'TRY', base: '1', vatRate: 0 }, acc()));
  });
});

describe('tahsilat, ödeme, masraf, virman', () => {
  it('tahsilat cariyi alacaklandırır ve hesabı artırır; para birimi hesaptan gelir', async () => {
    ok(await recordPayment({ kind: 'collection', partyId: ids.musteri, accountId: ids.banka, amount: '5.000', date: '2026-09-15' }, acc()));
    expect(await partyBalance(ids.musteri!)).toBe('700000');
    expect(await balanceOf(ids.banka!)).toBe('500000');
    ok(await recordPayment({ kind: 'collection', partyId: ids.musteri, accountId: ids.usd, amount: '100', date: '2026-09-15' }, acc()));
    expect(await partyBalance(ids.musteri!, 'USD')).toBe('-10000');
  });

  it('ödeme tedarikçi borcunu kapatır', async () => {
    expect(await partyBalance(ids.tedarikci!)).toBe('-110000');
    ok(await recordPayment({ kind: 'payment', partyId: ids.tedarikci, accountId: ids.kasa, amount: '600', date: '2026-10-05' }, acc()));
    expect(await partyBalance(ids.tedarikci!)).toBe('-50000');
    expect(await balanceOf(ids.kasa!)).toBe('40000');
  });

  it('masraf KDV dahil tutardan KDV ayırır; virman aynı para biriminde; iptal iki tarafı birlikte geri alır', async () => {
    const m = ok(await recordExpense({ accountId: ids.banka, amount: '1.200', vatRate: 20, category: 'Kira', date: '2026-10-01' }, acc()));
    expect(m.vat).toBe('20000');
    expect(await balanceOf(ids.banka!)).toBe('380000');
    expect(await transfer({ fromAccountId: ids.banka, toAccountId: ids.usd, amount: '10', date: '2026-10-02' }, acc())).toMatchObject({ ok: false, fieldErrors: { toAccountId: expect.any(String) } });
    expect(await transfer({ fromAccountId: ids.banka, toAccountId: ids.banka, amount: '10', date: '2026-10-02' }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    ok(await transfer({ fromAccountId: ids.banka, toAccountId: ids.kasa, amount: '1.000', date: '2026-10-03' }, acc()));
    expect([await balanceOf(ids.banka!), await balanceOf(ids.kasa!)]).toEqual(['280000', '140000']);
    const st = ok(await accountStatement({ id: ids.kasa! }, acc()))!;
    const tr = st.rows.find((r) => r.transfer)!;
    ok(await reverseMovement({ id: tr.id, reason: 'Yanlış hesap' }, acc()));
    expect([await balanceOf(ids.banka!), await balanceOf(ids.kasa!)]).toEqual(['380000', '40000']);
    expect(await reverseMovement({ id: tr.id, reason: 'tekrar' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('arşivlenen hesaba hareket girilmez', async () => {
    const a = ok(await createAccount({ kind: 'cash', name: 'Eski kasa', currency: 'TRY', openingDate: '2026-01-01' }, acc()));
    ok(await archiveAccount({ id: a.id, version: 1, archived: true }, acc()));
    expect(await recordExpense({ accountId: a.id, amount: '10', category: 'Diğer', date: '2026-10-01' }, acc())).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(String) } });
    expect(await archiveAccount({ id: a.id, version: 1, archived: false }, acc())).toMatchObject({ ok: false, code: 'CONFLICT' });
  });
});

describe('çekler', () => {
  it('alınan çek cariyi kapatır; tahsil edilince banka artar; aynı çek iki kez girilmez', async () => {
    const before = BigInt((await partyBalance(ids.musteri!))!);
    const c = ok(await receiveCheck({ partyId: ids.musteri, checkNo: '1001', bank: 'İş Bankası', date: '2026-10-01', due: '2026-12-01', amount: '2.000', currency: 'TRY' }, acc()));
    expect(BigInt((await partyBalance(ids.musteri!))!)).toBe(before - 200000n);
    expect(await receiveCheck({ partyId: ids.musteri, checkNo: '1001', bank: 'İş Bankası', date: '2026-10-01', due: '2026-12-01', amount: '1', currency: 'TRY' }, acc())).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await settleCheck({ id: c.id, version: 1, accountId: ids.usd, date: '2026-10-10' }, acc())).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(String) } });
    const bank = BigInt(await balanceOf(ids.banka!));
    ok(await settleCheck({ id: c.id, version: 1, accountId: ids.banka, date: '2026-10-10' }, acc()));
    expect(BigInt(await balanceOf(ids.banka!))).toBe(bank + 200000n);
    expect(await settleCheck({ id: c.id, version: 2, accountId: ids.banka, date: '2026-10-10' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('karşılıksız çek müşterinin borcunu geri getirir; aynı numara yeniden girilebilir', async () => {
    const before = await partyBalance(ids.musteri!);
    const c = ok(await receiveCheck({ partyId: ids.musteri, checkNo: '2002', bank: 'Garanti', date: '2026-10-01', due: '2026-10-20', amount: '300', currency: 'TRY' }, acc()));
    ok(await returnCheck({ id: c.id, version: 1, reason: 'Karşılıksız' }, acc()));
    expect(await partyBalance(ids.musteri!)).toBe(before);
    ok(await receiveCheck({ partyId: ids.musteri, checkNo: '2002', bank: 'Garanti', date: '2026-10-02', due: '2026-10-25', amount: '300', currency: 'TRY' }, acc()));
  });

  it('ciro: tedarikçinin borcu kapanır, kasa değişmez; alındığı cariye ciro edilmez', async () => {
    const c = ok(await receiveCheck({ partyId: ids.ikisi, checkNo: '3003', bank: 'Akbank', date: '2026-10-01', due: '2026-11-15', amount: '500', currency: 'TRY' }, acc()));
    expect(await endorseCheck({ id: c.id, version: 1, partyId: ids.ikisi, date: '2026-10-03' }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    const kasa = await balanceOf(ids.kasa!);
    ok(await endorseCheck({ id: c.id, version: 1, partyId: ids.tedarikci, date: '2026-10-03' }, acc()));
    expect(await partyBalance(ids.tedarikci!)).toBe('0');
    expect(await balanceOf(ids.kasa!)).toBe(kasa);
    const list = ok(await checksList({ status: 'closed' }, acc()));
    expect(list.find((x) => x.id === c.id)).toMatchObject({ status: 'endorsed', endorsedTo: 'Cari tedarikci' });
  });

  it('verilen çek ödenince banka azalır', async () => {
    const c = ok(await issueCheck({ partyId: ids.tedarikci, checkNo: 'V-1', bank: 'Ziraat', date: '2026-10-05', due: '2026-10-30', amount: '100', currency: 'TRY' }, acc()));
    expect(await partyBalance(ids.tedarikci!)).toBe('10000');
    const bank = BigInt(await balanceOf(ids.banka!));
    ok(await settleCheck({ id: c.id, version: 1, accountId: ids.banka, date: '2026-10-12' }, acc()));
    expect(BigInt(await balanceOf(ids.banka!))).toBe(bank - 10000n);
  });

  it('çek hareketi genel iptal ekranından geri alınamaz', async () => {
    const st = ok(await partyLedger({ partyId: ids.musteri! }, acc()));
    const checkRow = st.currencies.find((c) => c.currency === 'TRY')!.rows.find((r) => r.text.startsWith('Çek'))!;
    expect(await reverseMovement({ id: checkRow.id, reason: 'deneme' }, acc())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });
});

describe('açılış, ekstre ve özet', () => {
  it('açılış bakiyesi ekstreye ilk satır olarak girer; sıfır girilince kalkar', async () => {
    ok(await setOpening({ partyId: ids.ikisi, currency: 'EUR', amount: '250', side: 'credit', date: '2026-01-01' }, acc()));
    expect(await partyBalance(ids.ikisi!, 'EUR')).toBe('-25000');
    ok(await setOpening({ partyId: ids.ikisi, currency: 'EUR', amount: '0', side: 'debit', date: '2026-01-01' }, acc()));
    expect(await partyBalance(ids.ikisi!, 'EUR')).toBeUndefined();
  });

  it('ekstre yürüyen bakiye ve açık kalemleri verir', async () => {
    const l = ok(await partyLedger({ partyId: ids.musteri!, today: '2026-10-18' }, acc()));
    const tr = l.currencies.find((c) => c.currency === 'TRY')!;
    expect(tr.rows[0]).toMatchObject({ text: 'Satış faturası GIB2026000001', debit: '1200000', balance: '1200000' });
    expect(tr.rows.at(-1)!.balance).toBe(tr.balance);
    expect(tr.receivable[0]).toMatchObject({ text: 'Satış faturası GIB2026000001', bucket: 'd1_30', daysOverdue: 18 });
    // Karşılıksız çıkan çek ayrı açık kalemdir (vadesi dönüş günü).
    expect(tr.receivable.find((x) => x.text.startsWith('Karşılıksız'))).toMatchObject({ open: '30000' });
  });

  it('özet: alacak, gecikmiş, kasa/banka, portföy çekleri, ayın KDV farkı ve takvim', async () => {
    const o = ok(await financeOverview({ today: '2026-10-18' }, acc()));
    const tr = o.totals.find((x) => x.currency === 'TRY')!;
    expect(BigInt(tr.overdueReceivable)).toBeGreaterThan(0n);
    expect(tr.checksIn).toBe('30000');
    expect(o.calendar.some((e) => e.kind === 'check_in')).toBe(true);
  });
});
