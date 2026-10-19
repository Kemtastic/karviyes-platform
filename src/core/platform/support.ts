import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Auth } from '@/core/auth/auth';
import type { CurrentUser } from '@/core/auth/session';
import type { Db } from '@/core/db/client';
import { companies, platformAdmins, platformViews } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { ROLES, type Role } from '@/core/modules/types';
import { definePlatformAction } from './action';

// Müşteri gözüyle bakış: panel yöneticisi gerekçe yazarak, süreli ve salt okunur olarak bir firmanın ekranlarını
// seçtiği rolün gözüyle görür. Başlangıç ve bitiş firmanın denetim kaydına da yazılır; firma kimin baktığını görür.

export const SUPPORT_COOKIE = 'kv_destek';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_MEMBERSHIP = '00000000-0000-0000-0000-000000000000';

export type SupportViewer = CurrentUser & { readOnly: true; support: NonNullable<CurrentUser['support']> };

export function supportViewIdFrom(headers: Headers): string | null {
  const raw = headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SUPPORT_COOKIE) return v.join('=') || null;
  }
  return null;
}

/** Çerezdeki bakış geçerliyse (oturum sahibinin, bitmemiş, süresi dolmamış, kişi hâlâ 2FA'lı panel yöneticisi) salt okunur kullanıcı. */
export async function resolveSupportView(auth: Auth, main: Db, headers: Headers, now = new Date()): Promise<SupportViewer | null> {
  const id = supportViewIdFrom(headers);
  if (!id || !UUID.test(id)) return null;
  const session = await auth.api.getSession({ headers });
  if (!session || !(session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) return null;
  const [v] = await main
    .select({ view: platformViews, companyName: companies.name })
    .from(platformViews)
    .innerJoin(platformAdmins, eq(platformAdmins.userId, platformViews.adminUserId))
    .innerJoin(companies, eq(companies.id, platformViews.targetCompanyId))
    .where(and(eq(platformViews.id, id), eq(platformViews.adminUserId, session.user.id), isNull(platformViews.endedAt), gt(platformViews.expiresAt, now)));
  if (!v) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    companyId: v.view.targetCompanyId,
    membershipId: NO_MEMBERSHIP,
    roles: [v.view.role as Role],
    kind: 'person',
    staffId: null,
    twoFactorEnabled: true,
    readOnly: true,
    support: { viewId: v.view.id, until: v.view.expiresAt.toISOString(), companyName: v.companyName },
  };
}

export const startSupportView = definePlatformAction({
  name: 'platform.startSupportView',
  input: z.object({
    companyId: z.string().uuid(),
    role: z.enum(ROLES),
    minutes: z.number().int().min(5).max(120).default(30),
    reason: z.string().trim().min(10, 'Gerekçeyi en az 10 karakterle yazın.').max(300),
  }),
  run: async (ctx, i) => {
    const [c] = await ctx.db.select({ id: companies.id }).from(companies).where(eq(companies.id, i.companyId));
    if (!c) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + i.minutes * 60_000);
    const [v] = await ctx.db
      .insert(platformViews)
      .values({ adminUserId: ctx.admin.userId, targetCompanyId: i.companyId, role: i.role, reason: i.reason, startedAt, expiresAt })
      .returning({ id: platformViews.id });
    await ctx.inCompany(i.companyId, (_tx, audit) => audit({ entity: 'support_view', entityId: v!.id, after: { admin: ctx.admin.email, role: i.role, minutes: i.minutes, reason: i.reason } }));
    await ctx.log({ targetCompanyId: i.companyId, detail: { viewId: v!.id, role: i.role, minutes: i.minutes, reason: i.reason } });
    return { id: v!.id, expiresAt: expiresAt.toISOString(), minutes: i.minutes };
  },
});

export const endSupportView = definePlatformAction({
  name: 'platform.endSupportView',
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [v] = await ctx.db
      .update(platformViews)
      .set({ endedAt: new Date() })
      .where(and(eq(platformViews.id, i.id), eq(platformViews.adminUserId, ctx.admin.userId), isNull(platformViews.endedAt)))
      .returning({ companyId: platformViews.targetCompanyId });
    if (!v) return { ended: false };
    await ctx.inCompany(v.companyId, (_tx, audit) => audit({ entity: 'support_view', entityId: i.id, after: { ended: true } }));
    await ctx.log({ targetCompanyId: v.companyId, detail: { viewId: i.id } });
    return { ended: true };
  },
});
