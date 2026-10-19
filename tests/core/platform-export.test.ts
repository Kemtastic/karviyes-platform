import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { auditLog, platformAdmins, user } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import type { PlatformAdmin, PlatformRuntime } from '@/core/platform/action';
import { exportCompanyData } from '@/core/platform/export';
import { createParty } from '@/core/parties/service';
import { inviteUser } from '@/core/users/service';
import { runtime, testUser } from '../helpers/runtime';

let t: TestDb;
const admin: PlatformAdmin = { userId: 'kurucu', email: 'kurucu@example.com', name: 'Kurucu', twoFactorEnabled: true };
const rt = (a: PlatformAdmin | null = admin): PlatformRuntime => ({ admin: a, db: t.db, batch: true });

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(user).values({ id: 'kurucu', name: 'Kurucu', email: 'kurucu@example.com', emailVerified: true, twoFactorEnabled: true });
  await t.db.insert(platformAdmins).values({ userId: 'kurucu', createdBy: 'kurulum' });
  ok(await createParty({ name: 'A Firmasının Müşterisi', kind: 'customer' }, { ...runtime(t, testUser(t.companyA, ['admin'])), batch: true }));
  ok(await inviteUser({ name: 'Davetli Kişi', email: 'davetli@a.example.com', roles: ['sales'] }, { ...runtime(t, testUser(t.companyA, ['admin'])), batch: true }));
  ok(await createParty({ name: 'B Firmasının Müşterisi', kind: 'customer' }, { ...runtime(t, testUser(t.companyB, ['admin'])), batch: true }));
});
afterAll(async () => { await t.close(); });

describe('firma verisini dışa aktarma', () => {
  it('yalnız o firmanın bütün tabloları gelir; büyük sayılar metin olarak taşınır', async () => {
    const out = ok(await exportCompanyData({ companyId: t.companyA }, rt()));
    expect(out.company).toMatchObject({ id: t.companyA, name: 'Firma A' });
    expect(out.tables.parties!.map((p) => p.name)).toEqual(['A Firmasının Müşterisi']);
    expect(Object.keys(out.tables)).toEqual(expect.arrayContaining(['parties', 'audit_log', 'memberships']));
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(JSON.stringify(out)).not.toContain('B Firmasının');
    // Davet ve mutabakat bağlantılarının özetleri teslim dosyasına girmez; ayrı veritabanı adresi de.
    expect(JSON.stringify(out)).not.toMatch(/token_hash|data_url_enc|dataUrlEnc|installTokenHash/);
  });

  it('dışa aktarma firmanın denetim kaydına yazılır; panel yöneticisi olmayan alamaz', async () => {
    const audit = await withCompany(t.companyA, (tx) => tx.select().from(auditLog), t.db);
    expect(audit.some((a) => a.action === 'platform.exportCompanyData')).toBe(true);
    expect(await exportCompanyData({ companyId: t.companyA }, rt(null))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
