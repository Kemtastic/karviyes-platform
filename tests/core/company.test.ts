import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { runtime, testUser } from '../helpers/runtime';
import { companyProfile, listAudit, updateCompanyBranding } from '@/core/company/service';

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });
const admin = () => runtime(t, testUser(t.companyA, ['admin']));

describe('firma ayarları', () => {
  it('geçersiz renk reddedilir', async () => {
    expect(await updateCompanyBranding({ name: 'Firma A', brandColor: '#zzz' }, admin())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('ad ve renk güncellenir, denetim kaydında görünür', async () => {
    expect(await updateCompanyBranding({ name: 'Yeni Ad', brandColor: '#1d4ed8' }, admin())).toMatchObject({ ok: true, data: { name: 'Yeni Ad', brandColor: '#1d4ed8' } });
    const audit = await listAudit({ entity: 'company' }, admin());
    expect(audit.ok && audit.data.rows.some((r) => r.action === 'company.branding')).toBe(true);
  });

  it('başka firmanın adı değişmez', async () => {
    await updateCompanyBranding({ name: 'A değişti', brandColor: '#000000' }, admin());
    const bAudit = await listAudit({}, runtime(t, testUser(t.companyB, ['admin'])));
    expect(bAudit.ok && bAudit.data.rows).toEqual([]);
  });

  it('satışçı denetim kaydını göremez', async () => {
    expect(await listAudit({}, runtime(t, testUser(t.companyA, ['sales'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('firma profili (v1.1)', () => {
  it('belge ve ekranlar için güncel firma adını her rol okur', async () => {
    await updateCompanyBranding({ name: 'Belge Adı A.Ş.', brandColor: '#123456' }, admin());
    const r = await companyProfile({}, runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device' })));
    expect(r).toMatchObject({ ok: true, data: { name: 'Belge Adı A.Ş.', brandColor: '#123456' } });
  });
});
