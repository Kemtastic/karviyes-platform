import { createHash, randomBytes } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, toFailure, type ActionResult, type ActionRuntime } from '@/core/action';
import { createUserWithPassword, MIN_PASSWORD_LENGTH, type Auth } from '@/core/auth/auth';
import { validateMembership } from '@/core/auth/policy';
import type { Db } from '@/core/db/client';
import { withCompany, writeAudit } from '@/core/db/scope';
import { invites, memberships, staff } from '@/core/db/schema';
import { getEnv } from '@/core/env';
import { AppError } from '@/core/errors';
import { sendMail } from '@/core/mail';
import { ROLES, type Role } from '@/core/modules/types';

export const INVITE_TTL_HOURS = 72;

const roleList = z.array(z.enum(ROLES)).min(1);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function authFor(deps?: { auth?: Auth }): Promise<Auth> {
  return deps?.auth ?? (await import('@/core/auth/session')).getAuth();
}

// ---- Davet -------------------------------------------------------------------------------------

export const inviteUser = defineAction({
  name: 'users.invite',
  roles: ['admin'],
  input: z.object({ email: z.string().email(), name: z.string().trim().min(2).max(120), roles: roleList }),
  run: async (ctx, i) => {
    validateMembership({ kind: 'person', roles: i.roles });
    const token = randomBytes(32).toString('base64url');
    const email = i.email.trim().toLowerCase();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
    const [row] = await ctx.tx
      .insert(invites)
      .values({ companyId: ctx.companyId, email, name: i.name, roles: i.roles, tokenHash: hashToken(token), expiresAt, createdBy: ctx.user.userId })
      .returning({ id: invites.id });
    const base = (() => {
      try {
        return getEnv().BETTER_AUTH_URL;
      } catch {
        return 'http://localhost:3000';
      }
    })();
    const link = `${base}/davet/${token}`;
    await ctx.audit({ entity: 'invite', entityId: row!.id, after: { email, roles: i.roles } });
    await sendMail(email, 'Hesap daveti', `${i.name}, sisteme davet edildiniz. Parolanızı belirlemek için bağlantı (${INVITE_TTL_HOURS} saat geçerli):\n${link}`).catch(() => undefined);
    return { link, expiresAt: expiresAt.toISOString() };
  },
});

export type AcceptDeps = { auth: Auth; db: Db; companyId: string; now?: Date };

// Oturumsuz çalışır: token tek başına yetkidir. Kullanıcı, firma işleminden önce oluşturulur (PGlite tek bağlantılı).
export async function acceptInvite(raw: unknown, deps: AcceptDeps): Promise<ActionResult<{ email: string }>> {
  try {
    const input = z.object({ token: z.string().min(20), password: z.string().min(MIN_PASSWORD_LENGTH).max(128) }).parse(raw);
    const now = deps.now ?? new Date();
    const hash = hashToken(input.token);
    const usable = async () => {
      const [inv] = await withCompany(deps.companyId, (tx) => tx.select().from(invites).where(eq(invites.tokenHash, hash)), deps.db);
      if (!inv || inv.usedAt || inv.expiresAt <= now) throw new AppError('INVALID_STATE', 'Davet bağlantısı geçersiz ya da süresi dolmuş.');
      return inv;
    };
    const inv = await usable();

    const ctx = await deps.auth.$context;
    const existing = await ctx.internalAdapter.findUserByEmail(inv.email);
    if (existing) {
      // Var olan hesap: parola değiştirilmez; daveti kabul eden kişi hesabın sahibi olduğunu mevcut parolasıyla kanıtlar.
      const accounts = await ctx.internalAdapter.findAccounts(existing.user.id);
      const hash = accounts.find((a) => a.providerId === 'credential')?.password;
      if (!hash || !(await ctx.password.verify({ hash, password: input.password }))) {
        throw new AppError('VALIDATION', 'Bu e-postayla zaten bir hesabınız var; mevcut parolanızı girin.', { password: 'Mevcut parolanızı girin.' });
      }
    }
    const userId = existing?.user.id ?? (await createUserWithPassword(deps.auth, { email: inv.email, name: inv.name, password: input.password })).id;

    await withCompany(
      deps.companyId,
      async (tx) => {
        const marked = await tx
          .update(invites)
          .set({ usedAt: now })
          .where(and(eq(invites.id, inv.id), sql`${invites.usedAt} is null`))
          .returning({ id: invites.id });
        if (!marked.length) throw new AppError('INVALID_STATE', 'Davet bağlantısı zaten kullanılmış.');
        const [m] = await tx.select({ id: memberships.id, kind: memberships.kind }).from(memberships).where(eq(memberships.userId, userId));
        if (m?.kind === 'device') throw new AppError('INVALID_STATE', 'Bu e-posta bir bölüm cihazına ait.');
        await writeAudit(tx, { companyId: deps.companyId, actorUserId: userId, action: 'users.acceptInvite', entity: 'invite', entityId: inv.id, after: { email: inv.email, roles: inv.roles, existingAccount: Boolean(existing) } });
        if (m) await tx.update(memberships).set({ roles: inv.roles, active: true, version: sql`${memberships.version} + 1` }).where(eq(memberships.id, m.id));
        else await tx.insert(memberships).values({ companyId: deps.companyId, userId, roles: inv.roles, kind: 'person' });
      },
      deps.db,
    );
    return { ok: true, data: { email: inv.email } };
  } catch (e) {
    return toFailure(e, 'users.acceptInvite');
  }
}

// ---- Üyelik ve roller ----------------------------------------------------------------------------

async function assertNotLastAdmin(tx: Parameters<Parameters<typeof withCompany>[1]>[0], membershipId: string): Promise<void> {
  const others = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(ne(memberships.id, membershipId), eq(memberships.active, true), sql`'admin' = any(${memberships.roles})`));
  if (!others.length) throw new AppError('INVALID_STATE', 'Son yöneticinin yetkisi kaldırılamaz. Önce başka bir yönetici atayın.');
}

export const updateMemberRoles = defineAction({
  name: 'users.updateRoles',
  roles: ['admin'],
  input: z.object({ membershipId: z.string().uuid(), roles: roleList, version: z.number().int() }),
  run: async (ctx, i) => {
    const [m] = await ctx.tx.select().from(memberships).where(eq(memberships.id, i.membershipId));
    if (!m) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.');
    validateMembership({ kind: m.kind, roles: i.roles as Role[] });
    if ((m.roles as Role[]).includes('admin') && !i.roles.includes('admin')) await assertNotLastAdmin(ctx.tx, m.id);
    const updated = await ctx.tx
      .update(memberships)
      .set({ roles: i.roles, version: m.version + 1 })
      .where(and(eq(memberships.id, m.id), eq(memberships.version, i.version)))
      .returning({ id: memberships.id });
    if (!updated.length) throw new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');
    await ctx.audit({ entity: 'membership', entityId: m.id, before: { roles: m.roles }, after: { roles: i.roles } });
    return { id: m.id };
  },
});

export const deactivateMember = defineAction({
  name: 'users.deactivate',
  roles: ['admin'],
  input: z.object({ membershipId: z.string().uuid() }),
  run: async (ctx, i) => {
    const [m] = await ctx.tx.select().from(memberships).where(eq(memberships.id, i.membershipId));
    if (!m) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.');
    if ((m.roles as Role[]).includes('admin')) await assertNotLastAdmin(ctx.tx, m.id);
    await ctx.tx.update(memberships).set({ active: false, version: m.version + 1 }).where(eq(memberships.id, m.id));
    await ctx.audit({ entity: 'membership', entityId: m.id, before: { active: true }, after: { active: false } });
    return { id: m.id };
  },
});

// ---- Bölüm cihaz hesabı ----------------------------------------------------------------------------

const deviceInput = z.object({ label: z.string().trim().min(2).max(80), roles: roleList, password: z.string().min(MIN_PASSWORD_LENGTH).max(128) });

const authorizeDevice = defineAction({
  name: 'users.createDevice.check',
  roles: ['admin'],
  input: deviceInput,
  run: async (_ctx, i) => {
    validateMembership({ kind: 'device', roles: i.roles });
    return i;
  },
});

const attachDevice = defineAction({
  name: 'users.createDevice',
  roles: ['admin'],
  input: z.object({ userId: z.string(), role: z.enum(ROLES), loginEmail: z.string() }),
  run: async (ctx, i) => {
    const [m] = await ctx.tx.insert(memberships).values({ companyId: ctx.companyId, userId: i.userId, roles: [i.role], kind: 'device' }).returning({ id: memberships.id });
    await ctx.audit({ entity: 'membership', entityId: m!.id, after: { kind: 'device', role: i.role, loginEmail: i.loginEmail } });
    return { membershipId: m!.id, loginEmail: i.loginEmail };
  },
});

// Tablet hesabı: e-posta yerine sistemin ürettiği giriş adı (…@cihaz.yerel) ve yöneticinin verdiği parola.
export async function createDeviceAccount(raw: unknown, rt?: ActionRuntime, deps?: { auth?: Auth }) {
  const checked = await authorizeDevice(raw, rt);
  if (!checked.ok) return checked;
  const role = checked.data.roles[0]!;
  const loginEmail = `${role}-${randomBytes(3).toString('hex')}@cihaz.yerel`;
  const auth = await authFor(deps);
  const user = await createUserWithPassword(auth, { email: loginEmail, name: checked.data.label, password: checked.data.password });
  return attachDevice({ userId: user.id, role, loginEmail }, rt);
}

// ---- Personel kartları ---------------------------------------------------------------------------

const staffInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['master', 'collector', 'operator', 'sales', 'other']),
  departments: z.array(z.enum(ROLES)).default([]),
});

export const createStaff = defineAction({
  name: 'staff.create',
  roles: ['admin'],
  input: staffInput,
  run: async (ctx, i) => {
    const [row] = await ctx.tx.insert(staff).values({ companyId: ctx.companyId, ...i }).returning();
    await ctx.audit({ entity: 'staff', entityId: row!.id, after: i });
    return row!;
  },
});

export const updateStaff = defineAction({
  name: 'staff.update',
  roles: ['admin'],
  input: staffInput.extend({ id: z.string().uuid(), version: z.number().int(), active: z.boolean().default(true) }),
  run: async (ctx, i) => {
    const [before] = await ctx.tx.select().from(staff).where(eq(staff.id, i.id));
    if (!before) throw new AppError('NOT_FOUND', 'Personel bulunamadı.');
    const updated = await ctx.tx
      .update(staff)
      .set({ name: i.name, kind: i.kind, departments: i.departments, active: i.active, version: before.version + 1 })
      .where(and(eq(staff.id, i.id), eq(staff.version, i.version)))
      .returning();
    if (!updated.length) throw new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');
    await ctx.audit({ entity: 'staff', entityId: i.id, before, after: updated[0] });
    return updated[0]!;
  },
});
