import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { runtime, testUser } from '../helpers/runtime';
import { withCompany } from '@/core/db/scope';
import { auditLog } from '@/core/db/schema';
import { createParty, importParties, searchParties } from '@/core/parties/service';

let t: TestDb;
const admin = () => runtime(t, testUser(t.companyA, ['admin']));

// Eski Karviyes dışa aktarım başlıkları ve Türkçe Excel (";") biçimi.
const legacyCsv = [
  'FİRMA ADI;YETKİLİ KİŞİ;İLETİŞİM GSM;İL;İLÇE;VKN',
  'Mevcut Gıda Ltd.;Ali;0555 1;Antalya;Muratpaşa;9990000005',
  'Yeni Tekstil;Ayşe;0555 2;Antalya;Kaleiçi;',
  'Kötü VKN A.Ş.;;;İzmir;;1234567891',
  ';Adsız;;;;',
  'yeni tekstil;Tekrar;;;;',
  'Şahıs Müşteri;;;;;10000000146',
].join('\r\n');

beforeAll(async () => {
  t = await createTestDb();
  await createParty({ kind: 'customer', name: 'Mevcut Gıda Ltd.', legalType: 'company', taxId: '9990000005' }, admin());
});
afterAll(async () => { await t.close(); });

describe('carileri içe aktarma', () => {
  it('önizleme hiçbir şey yazmaz; eklenecek, atlanan, hatalı ve uyarılar satır numarasıyla', async () => {
    const r = await importParties({ csv: legacyCsv, dryRun: true }, admin());
    if (!r.ok) throw new Error(r.message);
    expect(r.data).toMatchObject({ total: 6, toAdd: 3, added: 0 });
    expect(r.data.skipped.map((s) => [s.row, s.reason])).toEqual([[2, 'Aynı VKN ile kayıtlı cari var.'], [6, 'Dosyada aynı ad daha önce geçiyor.']]);
    expect(r.data.errors.map((e) => e.row)).toEqual([5]);
    expect(r.data.warnings.map((w) => w.row)).toEqual([3, 4]);
    const all = await searchParties({ q: '' }, admin());
    expect(all.ok && all.data.length).toBe(1);
  });

  it('içe aktarınca geçerli satırlar eklenir; geçersiz isteğe bağlı alanlar boşaltılır; 11 haneli kimlik şahıs sayılır', async () => {
    const r = await importParties({ csv: legacyCsv, dryRun: false }, admin());
    if (!r.ok) throw new Error(r.message);
    expect(r.data.added).toBe(3);
    const all = await searchParties({ q: '' }, admin());
    if (!all.ok) throw new Error(all.message);
    const byName = Object.fromEntries(all.data.map((p) => [p.name, p]));
    expect(byName['Yeni Tekstil']).toMatchObject({ contactName: 'Ayşe', phone: '0555 2', city: 'Antalya', district: '', kind: 'customer' });
    expect(byName['Kötü VKN A.Ş.']).toMatchObject({ taxId: '', city: 'İzmir' });
    expect(byName['Şahıs Müşteri']).toMatchObject({ legalType: 'individual', taxId: '10000000146' });
    const logs = await withCompany(t.companyA, (tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'parties.import')), t.db);
    expect(logs).toHaveLength(1);
  });

  it('ikinci kez aynı dosya hiçbir şey eklemez', async () => {
    const r = await importParties({ csv: legacyCsv, dryRun: false }, admin());
    expect(r.ok && r.data.added).toBe(0);
  });

  it('bizim dışa aktarım başlıklarımızla da çalışır; ad sütunu yoksa anlaşılır hata', async () => {
    const ours = '﻿Ad;Tür;Şahıs/Şirket;VKN/TCKN;Vergi dairesi;İl;İlçe;Adres;Yetkili;Telefon;E-posta;Not\r\nTedarik A.Ş.;Tedarikçi;Şirket;;;;;;;;bilgi@tedarik.example;\r\n';
    const r = await importParties({ csv: ours, dryRun: false }, admin());
    expect(r.ok && r.data.added).toBe(1);
    const found = await searchParties({ q: 'tedarik', kind: 'supplier' }, admin());
    expect(found.ok && found.data.map((p) => p.email)).toEqual(['bilgi@tedarik.example']);
    expect(await importParties({ csv: 'Telefon;İl\r\n1;2', dryRun: true }, admin())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('satış personeli içe aktarabilir, bölüm tableti aktaramaz', async () => {
    expect(await importParties({ csv: legacyCsv, dryRun: true }, runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device' })))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('içe aktarma sınırları (inceleme)', () => {
  it('5000 satır tek seferde eklenir (veritabanı parametre sınırına takılmaz)', async () => {
    const t2 = await createTestDb();
    try {
      const csv = ['Ad;Telefon', ...Array.from({ length: 5000 }, (_, i) => `Toplu Cari ${i};0555 ${i}`)].join('\r\n');
      const r = await importParties({ csv, dryRun: false }, runtime(t2, testUser(t2.companyA, ['admin'])));
      expect(r.ok && r.data.added).toBe(5000);
    } finally {
      await t2.close();
    }
  }, 120000);

  it('Türkçe karakterleri bozulmuş (yanlış kodlamayla okunmuş) dosya reddedilir', async () => {
    const r = await importParties({ csv: 'Ad\r\nKar\uFFFDyaka Gıda', dryRun: true }, admin());
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' });
  });
});
