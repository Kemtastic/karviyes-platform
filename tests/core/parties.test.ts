import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { runtime, testUser } from '../helpers/runtime';
import { normalizeSearch } from '@/core/parties/search';
import { validateTaxId } from '@/core/parties/tax-id';
import { isDistrictOf } from '@/core/parties/locations';
import { createParty, partyDetail, searchParties, updateParty } from '@/core/parties/service';

describe('VKN / TCKN', () => {
  it.each(['9990000005', '9990000013', '1234567890', '0000000019'])('geçerli VKN %s', (v) => expect(validateTaxId(v, 'company')).toBe(true));
  it.each(['9990000006', '1234567891', '0000000010', '999000000', 'abcdefghij'])('geçersiz VKN %s', (v) => expect(validateTaxId(v, 'company')).toBe(false));
  it('geçerli TCKN', () => expect(validateTaxId('10000000146', 'individual')).toBe(true));
  it.each(['10000000145', '00000000146', '1000000014'])('geçersiz TCKN %s', (v) => expect(validateTaxId(v, 'individual')).toBe(false));
});

describe('il / ilçe', () => {
  it('ilçe ile ait olmalı', () => {
    expect(isDistrictOf('Antalya', 'Muratpaşa')).toBe(true);
    expect(isDistrictOf('Antalya', 'Kaleiçi')).toBe(false);
    expect(isDistrictOf('Yokİl', 'Merkez')).toBe(false);
  });
});

describe('Türkçe arama', () => {
  it('büyük/küçük ve noktalı/noktasız i farkı arama anahtarını değiştirmez', () => {
    const a = normalizeSearch('İSTANBUL');
    expect(normalizeSearch('ıstanbul')).toBe(a);
    expect(normalizeSearch('İstanbul')).toBe(a);
    expect(normalizeSearch('Istanbul')).toBe(a);
  });
  it('ünvan noktalaması aramayı bozmaz', () => {
    expect(normalizeSearch('ABC Ltd. Şti.')).toBe(normalizeSearch('abc ltd sti'));
  });
});

describe('cari kartlar', () => {
  let t: TestDb;
  beforeAll(async () => { t = await createTestDb(); });
  afterAll(async () => { await t.close(); });
  const sales = () => runtime(t, testUser(t.companyA, ['sales']));
  const base = { kind: 'customer', name: 'Örnek Gıda Ltd. Şti.', legalType: 'company', taxId: '9990000005', taxOffice: 'Muratpaşa Vergi Dairesi Müdürlüğü', city: 'Antalya', district: 'Muratpaşa', address: 'Lara Cd. 1', contactName: 'Ayşe Kaya', phone: '0555 000 00 01', email: 'muhasebe@example.com' };

  it('il dışı ilçe reddedilir', async () => {
    const r = await createParty({ ...base, district: 'Kaleiçi' }, sales());
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' });
    if (!r.ok) expect(r.fieldErrors?.district).toBeTruthy();
  });

  it('geçersiz VKN reddedilir', async () => {
    expect(await createParty({ ...base, taxId: '9990000006' }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('cari oluşur ve Türkçe aramayla bulunur', async () => {
    expect(await createParty(base, sales())).toMatchObject({ ok: true });
    const found = await searchParties({ q: 'ORNEK GIDA' }, sales());
    expect(found.ok && found.data.map((p) => p.name)).toEqual(['Örnek Gıda Ltd. Şti.']);
  });

  it('aynı VKN ile ikinci aktif cari CONFLICT', async () => {
    expect(await createParty({ ...base, name: 'Başka Ad' }, sales())).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('başka firmanın kapsamında cari görünmez', async () => {
    const other = await searchParties({ q: 'gida' }, runtime(t, testUser(t.companyB, ['sales'])));
    expect(other.ok && other.data).toEqual([]);
  });

  it('eski sürümle güncelleme CONFLICT', async () => {
    const found = await searchParties({ q: 'gida' }, sales());
    if (!found.ok) throw new Error('arama');
    const p = found.data[0]!;
    expect(await updateParty({ ...base, id: p.id, version: p.version, phone: '0555 000 00 02' }, sales())).toMatchObject({ ok: true });
    expect(await updateParty({ ...base, id: p.id, version: p.version, phone: '0555 000 00 03' }, sales())).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('bölüm tableti cari oluşturamaz', async () => {
    expect(await createParty(base, runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device' })))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('inceleme düzeltmeleri (cari)', () => {
  let t: TestDb;
  beforeAll(async () => { t = await createTestDb(); });
  afterAll(async () => { await t.close(); });

  it('müşteri araması sınırdan önce türe göre süzülür', async () => {
    const admin = runtime(t, testUser(t.companyA, ['admin']));
    for (let i = 0; i < 3; i++) await createParty({ kind: 'supplier', name: `A Tedarik ${i}`, legalType: 'company' }, admin);
    await createParty({ kind: 'customer', name: 'Z Müşteri', legalType: 'company' }, admin);
    const r = await searchParties({ q: '', kind: 'customer', limit: 2 }, admin);
    expect(r.ok && r.data.map((p) => p.name)).toEqual(['Z Müşteri']);
  });

  it('yalnızca bölüm rolü olan kişisel hesap cari kartını göremez', async () => {
    const admin = runtime(t, testUser(t.companyA, ['admin']));
    const p = await createParty({ kind: 'customer', name: 'Gizli Cari', legalType: 'company', taxId: '9990000013' }, admin);
    if (!p.ok) throw new Error('x');
    expect(await partyDetail({ id: p.data.id }, runtime(t, testUser(t.companyA, ['cutting'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await partyDetail({ id: p.data.id }, admin)).toMatchObject({ ok: true, data: { name: 'Gizli Cari' } });
  });
});
