import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { companies, companySettings, memberships } from '@/core/db/schema';
import { getEnv } from '@/core/env';
import { AppError } from '@/core/errors';
import { getInstallConfig } from '@/core/install-config';
import { sendMail } from '@/core/mail';
import type { Role } from '@/core/modules/types';
import { companyIdForHost, companyOrigins } from '@/core/company/tenant';
import { createAuth, type Auth } from './auth';
import { validateMembership, type AccountKind } from './policy';

export type CurrentUser = {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  membershipId: string;
  roles: Role[];
  kind: AccountKind;
  staffId: string | null;
  twoFactorEnabled: boolean;
};

let authInstance: Promise<Auth> | undefined;

export function getAuth(): Promise<Auth> {
  authInstance ??= (async () => {
    const env = getEnv();
    return createAuth(await getDb(), {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      issuer: getInstallConfig().company.name,
      trustedOrigins: async () => companyOrigins(await getDb()),
      sendResetPassword: ({ user, url }) => sendMail(user.email, 'Parola sıfırlama', `Parolanızı sıfırlamak için bağlantı (1 saat geçerli):\n${url}`),
    });
  })();
  return authInstance;
}

// İsteğin firması: adres bir firmaya kayıtlıysa o firma (çok firmalı kurulum), değilse kurulum ayarındaki firma.
export async function getCompanyId(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  return companyIdForHost(await getDb(), h.get('x-forwarded-host') ?? h.get('host') ?? '', getInstallConfig().company.slug);
}

export async function resolveCurrentUser(auth: Auth, db: Db, companyId: string, headers: Headers): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const [m, suspended] = await withCompany(
    companyId,
    async (tx) => {
      const [row] = await tx.select().from(memberships).where(and(eq(memberships.userId, session.user.id), eq(memberships.active, true)));
      // Merkez panelden askıya alınan firmanın kullanıcıları oturum açmış sayılmaz.
      const [st] = await tx.select({ status: companySettings.status }).from(companySettings).where(eq(companySettings.companyId, companyId));
      return [row, st?.status === 'suspended'] as const;
    },
    db,
  );
  if (!m || suspended) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    companyId,
    membershipId: m.id,
    roles: m.roles as Role[],
    kind: m.kind,
    staffId: m.staffId,
    twoFactorEnabled: Boolean((session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled),
  };
}

// Aynı istekte (layout, sayfa, eylemler) oturum bir kez çözülür.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const { headers } = await import('next/headers');
  return resolveCurrentUser(await getAuth(), await getDb(), await getCompanyId(), await headers());
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError('UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  return user;
}

export async function addMembership(db: Db, companyId: string, m: { userId: string; roles: Role[]; kind: AccountKind; staffId?: string | null }): Promise<string> {
  validateMembership(m);
  const [row] = await withCompany(
    companyId,
    (tx) => tx.insert(memberships).values({ companyId, userId: m.userId, roles: m.roles, kind: m.kind, staffId: m.staffId ?? null }).returning({ id: memberships.id }),
    db,
  );
  return row!.id;
}
