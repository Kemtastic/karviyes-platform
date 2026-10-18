import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { runtime, testUser } from '../helpers/runtime';
import { createAuth, createUserWithPassword, type Auth } from '@/core/auth/auth';
import { addMembership } from '@/core/auth/session';
import { withCompany } from '@/core/db/scope';
import { invites, memberships } from '@/core/db/schema';
import {
  acceptInvite,
  createDeviceAccount,
  createStaff,
  deactivateMember,
  inviteUser,
  updateMemberRoles,
} from '@/core/users/service';

let t: TestDb;
let auth: Auth;
let adminA: string;
let adminMembershipA: string;
let memberB: string;

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: 'Test' });
  adminA = (await createUserWithPassword(auth, { email: 'admin-a@example.com', name: 'Yönetici A', password: 'GucluParola-2026!' })).id;
  adminMembershipA = await addMembership(t.db, t.companyA, { userId: adminA, roles: ['admin'], kind: 'person' });
  const b = await createUserWithPassword(auth, { email: 'b@example.com', name: 'B', password: 'GucluParola-2026!' });
  memberB = await addMembership(t.db, t.companyB, { userId: b.id, roles: ['sales'], kind: 'person' });
});
afterAll(async () => { await t.close(); });

const admin = () => runtime(t, testUser(t.companyA, ['admin'], { userId: adminA, membershipId: adminMembershipA }));
const deps = () => ({ auth, db: t.db, companyId: t.companyA, now: new Date() });

describe('davet', () => {
  it('davet edilen kişi parolasını belirleyip üye olur; token ikinci kez kullanılamaz', async () => {
    const r = await inviteUser({ email: 'Yeni@Example.com', name: 'Yeni Satışçı', roles: ['sales'] }, admin());
    if (!r.ok) throw new Error(r.message);
    const token = new URL(r.data.link).pathname.split('/').pop()!;
    const accepted = await acceptInvite({ token, password: 'YeniParola-2026!' }, deps());
    expect(accepted).toMatchObject({ ok: true });
    const ms = await withCompany(t.companyA, (tx) => tx.select().from(memberships), t.db);
    expect(ms.some((m) => m.roles.includes('sales'))).toBe(true);
    expect(await acceptInvite({ token, password: 'YeniParola-2026!' }, deps())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('süresi geçmiş davet reddedilir', async () => {
    const r = await inviteUser({ email: 'gec@example.com', name: 'Geç', roles: ['tracking'] }, admin());
    if (!r.ok) throw new Error(r.message);
    const token = new URL(r.data.link).pathname.split('/').pop()!;
    const later = new Date(Date.now() + 73 * 3600 * 1000);
    expect(await acceptInvite({ token, password: 'YeniParola-2026!' }, { ...deps(), now: later })).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('davet kaydında token düz metin saklanmaz', async () => {
    const r = await inviteUser({ email: 'hash@example.com', name: 'Hash', roles: ['sales'] }, admin());
    if (!r.ok) throw new Error(r.message);
    const token = new URL(r.data.link).pathname.split('/').pop()!;
    const rows = await withCompany(t.companyA, (tx) => tx.select().from(invites).where(eq(invites.email, 'hash@example.com')), t.db);
    expect(rows[0]!.tokenHash).not.toContain(token);
  });

  it('bölüm cihaz hesabı davet gönderemez', async () => {
    const device = runtime(t, testUser(t.companyA, ['printing'], { kind: 'device' }));
    expect(await inviteUser({ email: 'x@example.com', name: 'X', roles: ['sales'] }, device)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('roller', () => {
  it('son aktif yöneticinin yöneticiliği kaldırılamaz', async () => {
    expect(await updateMemberRoles({ membershipId: adminMembershipA, roles: ['sales'], version: 1 }, admin())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(await deactivateMember({ membershipId: adminMembershipA }, admin())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('başka firmanın üyeliği güncellenemez', async () => {
    expect(await updateMemberRoles({ membershipId: memberB, roles: ['admin'], version: 1 }, admin())).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('eski sürümle güncelleme CONFLICT', async () => {
    const r = await inviteUser({ email: 'surum@example.com', name: 'Sürüm', roles: ['sales'] }, admin());
    if (!r.ok) throw new Error(r.message);
    await acceptInvite({ token: new URL(r.data.link).pathname.split('/').pop()!, password: 'YeniParola-2026!' }, deps());
    const [m] = await withCompany(t.companyA, (tx) => tx.select().from(memberships).where(eq(memberships.roles, ['sales'])), t.db);
    expect(await updateMemberRoles({ membershipId: m!.id, roles: ['tracking'], version: m!.version }, admin())).toMatchObject({ ok: true });
    expect(await updateMemberRoles({ membershipId: m!.id, roles: ['sales'], version: m!.version }, admin())).toMatchObject({ ok: false, code: 'CONFLICT' });
  });
});

describe('bölüm cihaz hesabı ve personel', () => {
  it('cihaz hesabına iki rol verilemez', async () => {
    expect(await createDeviceAccount({ label: 'Baskı tableti', roles: ['printing', 'cutting'], password: 'TabletParola-2026' }, admin(), { auth })).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('cihaz hesabı tek bölüm rolüyle oluşur ve giriş e-postası döner', async () => {
    const r = await createDeviceAccount({ label: 'Baskı tableti', roles: ['printing'], password: 'TabletParola-2026' }, admin(), { auth });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data.loginEmail).toMatch(/@cihaz\.yerel$/);
  });

  it('personel kartı bölümleriyle oluşur', async () => {
    const r = await createStaff({ name: 'Emre Kesim', kind: 'master', departments: ['cutting'] }, admin());
    expect(r).toMatchObject({ ok: true });
  });
});
