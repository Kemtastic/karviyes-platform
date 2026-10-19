import { asc, countDistinct, desc, eq, gte, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/core/db/client';
import { auditLog, companies, memberships, session, user } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { assertNotLastAdmin } from '@/core/users/service';
import { definePlatformAction } from './action';

// Merkez panelden firma içini görme: kullanıcılar, kullanım ve denetim kaydı.
// Üyelik ve denetim kaydı firmanın veri veritabanında, kimlik ve oturumlar ana veritabanında durur.

async function identities(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; email: string; twoFactorEnabled: boolean; lastLogin: string | null }>();
  const [us, last] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, twoFactorEnabled: user.twoFactorEnabled }).from(user).where(inArray(user.id, ids)),
    db.select({ userId: session.userId, at: max(session.createdAt) }).from(session).where(inArray(session.userId, ids)).groupBy(session.userId),
  ]);
  const lastBy = new Map(last.map((l) => [l.userId, l.at]));
  return new Map(us.map((u) => [u.id, { name: u.name, email: u.email, twoFactorEnabled: Boolean(u.twoFactorEnabled), lastLogin: lastBy.get(u.id)?.toISOString() ?? null }]));
}

/** Firmanın kullanıcıları: rol, hesap türü, durum, 2FA ve son oturum açma. */
export const platformCompanyUsers = definePlatformAction({
  name: 'platform.companyUsers',
  rateLimit: false,
  input: z.object({ companyId: z.string().uuid() }),
  run: async (ctx, i) => {
    const ms = await ctx.inCompany(i.companyId, (tx) => tx.select().from(memberships).orderBy(asc(memberships.createdAt)));
    const who = await identities(ctx.db, ms.map((m) => m.userId));
    return ms.map((m) => {
      const id = who.get(m.userId);
      return {
        membershipId: m.id, userId: m.userId, name: id?.name ?? '—', email: id?.email ?? '—', roles: m.roles, kind: m.kind, active: m.active,
        twoFactorEnabled: id?.twoFactorEnabled ?? false, lastLogin: id?.lastLogin ?? null,
      };
    });
  },
});

/** Kullanıcıyı firmada kilitler ya da açar. Gerekçe zorunlu; firma denetim kaydına ve panel kaydına yazılır. */
export const platformSetMemberActive = definePlatformAction({
  name: 'platform.setMemberActive',
  input: z.object({
    companyId: z.string().uuid(),
    membershipId: z.string().uuid(),
    active: z.boolean(),
    reason: z.string().trim().min(3, 'Gerekçe yazın.').max(300),
  }),
  run: async (ctx, i) => {
    const changed = await ctx.inCompany(i.companyId, async (tx, audit) => {
      const [before] = await tx.select().from(memberships).where(eq(memberships.id, i.membershipId));
      if (!before) throw new AppError('NOT_FOUND', 'Bu firmada böyle bir kullanıcı yok.');
      if (!i.active && before.active && before.roles.includes('admin')) await assertNotLastAdmin(tx, before.id);
      await tx.update(memberships).set({ active: i.active, version: sql`${memberships.version} + 1` }).where(eq(memberships.id, i.membershipId));
      await audit({ entity: 'membership', entityId: i.membershipId, before: { active: before.active }, after: { active: i.active, reason: i.reason } });
      return before;
    });
    await ctx.log({ targetCompanyId: i.companyId, detail: { userId: changed.userId, active: i.active, reason: i.reason } });
    return { active: i.active };
  },
});

/** Son 30 günde firmada yapılan işler: alan (sipariş, üretim, muhasebe…) bazında sayı ve işlem yapan kişi sayısı. */
export const platformCompanyUsage = definePlatformAction({
  name: 'platform.companyUsage',
  rateLimit: false,
  input: z.object({ companyId: z.string().uuid(), now: z.string().datetime().optional() }),
  run: async (ctx, i) => {
    const since = new Date((i.now ? Date.parse(i.now) : Date.now()) - 30 * 86_400_000);
    const area = sql<string>`split_part(${auditLog.action}, '.', 1)`;
    return ctx.inCompany(i.companyId, async (tx) => {
      const rows = await tx.select({ area, n: sql<number>`count(*)::int` }).from(auditLog).where(gte(auditLog.at, since)).groupBy(area);
      const [actors] = await tx.select({ n: countDistinct(auditLog.actorUserId) }).from(auditLog).where(gte(auditLog.at, since));
      return { since: since.toISOString(), byArea: Object.fromEntries(rows.map((r) => [r.area, Number(r.n)])) as Record<string, number>, activeActors: Number(actors?.n ?? 0) };
    });
  },
});

/** Firmaların denetim kaydı (yeniden eskiye), firma adı ve işlemi yapanla. Firma verilmezse hepsi. */
export const platformCompanyAudit = definePlatformAction({
  name: 'platform.companyAudit',
  rateLimit: false,
  input: z.object({ companyId: z.string().uuid().optional(), limit: z.number().int().min(1).max(300).default(100) }),
  run: async (ctx, i) => {
    const list = await ctx.db.select({ id: companies.id, name: companies.name }).from(companies).where(i.companyId ? eq(companies.id, i.companyId) : undefined);
    const rows = [];
    for (const c of list) {
      const part = await ctx.inCompany(c.id, (tx) => tx.select().from(auditLog).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(i.limit));
      rows.push(...part.map((a) => ({ ...a, companyName: c.name })));
    }
    rows.sort((a, b) => b.at.getTime() - a.at.getTime());
    const top = rows.slice(0, i.limit);
    const who = await identities(ctx.db, [...new Set(top.map((a) => a.actorUserId).filter((x): x is string => Boolean(x)))]);
    return top.map((a) => ({
      id: String(a.id), at: a.at.toISOString(), companyId: a.companyId, companyName: a.companyName, action: a.action, entity: a.entity, entityId: a.entityId,
      actorName: a.actorUserId ? (who.get(a.actorUserId)?.name ?? a.actorUserId) : null, after: a.after,
    }));
  },
});
