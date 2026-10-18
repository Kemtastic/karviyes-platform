import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { companies, memberships } from '@/core/db/schema';
import { getEnv } from '@/core/env';
import { AppError } from '@/core/errors';
import { getInstallConfig } from '@/core/install-config';
import { sendMail } from '@/core/mail';
import type { Role } from '@/core/modules/types';
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
      sendResetPassword: ({ user, url }) => sendMail(user.email, 'Parola sıfırlama', `Parolanızı sıfırlamak için bağlantı (1 saat geçerli):\n${url}`),
    });
  })();
  return authInstance;
}

let companyIdCache: string | undefined;

// Bir kurulum bir firmadır: firma kimliği kurulum ayarındaki slug ile bulunur.
export async function getCompanyId(): Promise<string> {
  if (companyIdCache) return companyIdCache;
  const db = await getDb();
  const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, getInstallConfig().company.slug));
  if (!row) throw new Error('Firma bulunamadı; önce "pnpm kurulum" çalıştırın.');
  companyIdCache = row.id;
  return row.id;
}

export async function resolveCurrentUser(auth: Auth, db: Db, companyId: string, headers: Headers): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const [m] = await withCompany(
    companyId,
    (tx) => tx.select().from(memberships).where(and(eq(memberships.userId, session.user.id), eq(memberships.active, true))),
    db,
  );
  if (!m) return null;
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
