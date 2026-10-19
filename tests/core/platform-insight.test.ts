import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { addMembership } from '@/core/auth/session';
import { auditLog, platformAdmins, platformAudit, session, user } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import type { PlatformAdmin, PlatformRuntime } from '@/core/platform/action';
import { platformCompanyAudit, platformCompanyUsage, platformCompanyUsers, platformSetMemberActive } from '@/core/platform/insight';

let t: TestDb;
let memberId: string;
const admin: PlatformAdmin = { userId: 'kurucu', email: 'kurucu@example.com', name: 'Kurucu', twoFactorEnabled: true };
const rt = (a: PlatformAdmin | null = admin): PlatformRuntime => ({ admin: a, db: t.db, batch: true });

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(user).values([
    { id: 'kurucu', name: 'Kurucu', email: 'kurucu@example.com', emailVerified: true, twoFactorEnabled: true },
    { id: 'ayse', name: 'Ayşe Satış', email: 'ayse@a.example.com', emailVerified: true, twoFactorEnabled: true },
    { id: 'mehmet', name: 'Mehmet Takip', email: 'mehmet@a.example.com', emailVerified: true, twoFactorEnabled: false },
    { id: 'zeynep', name: 'Zeynep B', email: 'zeynep@b.example.com', emailVerified: true },
  ]);
  await t.db.insert(platformAdmins).values({ userId: 'kurucu', createdBy: 'kurulum' });
  memberId = await addMembership(t.db, t.companyA, { userId: 'ayse', roles: ['sales'], kind: 'person' });
  await addMembership(t.db, t.companyA, { userId: 'mehmet', roles: ['tracking'], kind: 'person' });
  await addMembership(t.db, t.companyB, { userId: 'zeynep', roles: ['admin'], kind: 'person' });
  await t.db.insert(session).values({ id: 's1', userId: 'ayse', token: 'tok-1', expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date('2026-10-18T09:00:00Z'), updatedAt: new Date() });
  await t.db.insert(session).values({ id: 's2', userId: 'ayse', token: 'tok-2', expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date('2026-10-19T08:30:00Z'), updatedAt: new Date() });
  await withCompany(t.companyA, (tx) => tx.insert(auditLog).values([
    { companyId: t.companyA, actorUserId: 'ayse', action: 'orders.create', entity: 'order', entityId: '1' },
    { companyId: t.companyA, actorUserId: 'ayse', action: 'orders.create', entity: 'order', entityId: '2' },
    { companyId: t.companyA, actorUserId: 'mehmet', action: 'production.complete', entity: 'job', entityId: '1' },
    { companyId: t.companyA, actorUserId: 'ayse', action: 'finance.invoice', entity: 'invoice', entityId: '1', at: new Date('2026-08-01T10:00:00Z') },
  ]), t.db);
  await withCompany(t.companyB, (tx) => tx.insert(auditLog).values({ companyId: t.companyB, actorUserId: 'zeynep', action: 'orders.create', entity: 'order', entityId: '9' }), t.db);
});
afterAll(async () => { await t.close(); });

describe('firma kullanıcıları', () => {
  it('yalnız o firmanın üyeleri; rol, 2FA ve son giriş görünür', async () => {
    const users = ok(await platformCompanyUsers({ companyId: t.companyA }, rt()));
    expect(users.map((u) => u.email).sort()).toEqual(['ayse@a.example.com', 'mehmet@a.example.com']);
    expect(users.find((u) => u.email === 'ayse@a.example.com')).toMatchObject({ roles: ['sales'], twoFactorEnabled: true, active: true, lastLogin: '2026-10-19T08:30:00.000Z' });
    expect(users.find((u) => u.email === 'mehmet@a.example.com')).toMatchObject({ twoFactorEnabled: false, lastLogin: null });
  });

  it('kilitleme gerekçe ister; iki kayda da yazılır, açılınca geri gelir', async () => {
    expect(await platformSetMemberActive({ companyId: t.companyA, membershipId: memberId, active: false, reason: '' }, rt())).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    ok(await platformSetMemberActive({ companyId: t.companyA, membershipId: memberId, active: false, reason: 'Firmadan ayrıldı' }, rt()));
    expect((ok(await platformCompanyUsers({ companyId: t.companyA }, rt()))).find((u) => u.email === 'ayse@a.example.com')?.active).toBe(false);
    const audit = await withCompany(t.companyA, (tx) => tx.select().from(auditLog), t.db);
    expect(audit.some((a) => a.action === 'platform.setMemberActive' && a.actorUserId === 'kurucu')).toBe(true);
    expect((await t.db.select().from(platformAudit)).some((a) => a.action === 'platform.setMemberActive')).toBe(true);
    ok(await platformSetMemberActive({ companyId: t.companyA, membershipId: memberId, active: true, reason: 'Geri döndü' }, rt()));
    expect((ok(await platformCompanyUsers({ companyId: t.companyA }, rt()))).find((u) => u.email === 'ayse@a.example.com')?.active).toBe(true);
  });

  it('başka firmanın üyeliği bu firma üzerinden kilitlenemez', async () => {
    const [m] = await withCompany(t.companyB, (tx) => tx.select().from(auditLog), t.db);
    expect(m).toBeDefined();
    const zeynep = ok(await platformCompanyUsers({ companyId: t.companyB }, rt()))[0]!;
    expect(await platformSetMemberActive({ companyId: t.companyA, membershipId: zeynep.membershipId, active: false, reason: 'Deneme' }, rt())).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('panel yöneticisi olmayan göremez', async () => {
    expect(await platformCompanyUsers({ companyId: t.companyA }, rt(null))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('kullanım ve denetim', () => {
  it('son 30 günün işlemleri alan bazında sayılır', async () => {
    const u = ok(await platformCompanyUsage({ companyId: t.companyA, now: '2026-10-20T12:00:00Z' }, rt()));
    expect(u.byArea).toMatchObject({ orders: 2, production: 1 });
    expect(u.byArea.finance).toBeUndefined();
    expect(u.activeActors).toBeGreaterThanOrEqual(2);
  });

  it('tüm firmaların denetim kaydı firma adıyla, yeniden eskiye; tek firmaya süzülebilir', async () => {
    const all = ok(await platformCompanyAudit({ limit: 50 }, rt()));
    expect(new Set(all.map((a) => a.companyName))).toEqual(new Set(['Firma A', 'Firma B']));
    expect(all.find((a) => a.action === 'production.complete')?.actorName).toBe('Mehmet Takip');
    const times = all.map((a) => a.at);
    expect([...times].sort().reverse()).toEqual(times);
    const onlyB = ok(await platformCompanyAudit({ companyId: t.companyB, limit: 50 }, rt()));
    expect(onlyB.every((a) => a.companyName === 'Firma B')).toBe(true);
  });
});
