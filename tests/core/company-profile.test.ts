import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { getCompanyProfile, isValidIban, isValidTckn, updateCompanyProfile } from '@/core/company/profile';
import { runtime, testUser } from '../helpers/runtime';

let t: TestDb;
const as = (companyId: string, roles: Parameters<typeof testUser>[1] = ['admin']) => ({ ...runtime(t, testUser(companyId, roles)), batch: true });

beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

describe('denetim numaraları', () => {
  it('IBAN mod-97 ile, T.C. kimlik no kontrol haneleriyle doğrulanır', () => {
    expect(isValidIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
    expect(isValidIban('TR330006100519786457841327')).toBe(false);
    expect(isValidTckn('10000000146')).toBe(true);
    expect(isValidTckn('10000000147')).toBe(false);
    expect(isValidTckn('01234567890')).toBe(false);
  });
});

describe('firma profili', () => {
  const profile = {
    legalName: 'Firma A Ambalaj Sanayi ve Ticaret A.Ş.', taxOffice: 'Kozyatağı', taxNumber: '1234567890', mersisNo: '0123456789000015', tradeRegistryNo: '123456-5',
    address: 'Organize Sanayi 3. Cadde No:5', city: 'İstanbul', phone: '0216 555 00 00', email: 'info@firma-a.example.com', website: 'firma-a.example.com',
    bank: 'Ziraat', iban: 'TR33 0006 1005 1978 6457 8413 26',
    accountant: { name: 'Mali Müşavir Ali', email: 'ali@smmm.example.com', phone: '0532 000 00 00' },
  };

  it('yönetici kaydeder; IBAN boşluksuz büyük harfle saklanır; başka firmaya geçmez; kayda yazılır', async () => {
    const r = await updateCompanyProfile(profile, as(t.companyA));
    expect(r.ok).toBe(true);
    const a = await getCompanyProfile({}, as(t.companyA));
    expect(a).toMatchObject({ ok: true, data: { legalName: profile.legalName, iban: 'TR330006100519786457841326', accountant: { name: 'Mali Müşavir Ali' } } });
    expect(await getCompanyProfile({}, as(t.companyB))).toMatchObject({ ok: true, data: { legalName: '' } });
  });

  it('hatalı numaralar alan hatası verir; yönetici olmayan değiştiremez', async () => {
    expect(await updateCompanyProfile({ ...profile, iban: 'TR330006100519786457841327' }, as(t.companyA))).toMatchObject({ ok: false, fieldErrors: { iban: expect.any(String) } });
    expect(await updateCompanyProfile({ ...profile, taxNumber: '12345' }, as(t.companyA))).toMatchObject({ ok: false, fieldErrors: { taxNumber: expect.any(String) } });
    expect(await updateCompanyProfile({ ...profile, taxNumber: '10000000147' }, as(t.companyA))).toMatchObject({ ok: false, fieldErrors: { taxNumber: expect.any(String) } });
    expect(await updateCompanyProfile({ ...profile, mersisNo: '123' }, as(t.companyA))).toMatchObject({ ok: false, fieldErrors: { mersisNo: expect.any(String) } });
    expect(await updateCompanyProfile(profile, as(t.companyA, ['sales']))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
