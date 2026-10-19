import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins';
import type { Db } from '@/core/db/client';
import { account, rateLimit, session, twoFactor as twoFactorTable, user, verification } from '@/core/db/schema';

export const MIN_PASSWORD_LENGTH = 12;

export type AuthOptions = {
  secret: string;
  baseURL: string;
  issuer: string;
  sendResetPassword?: (data: { user: { email: string }; url: string }) => Promise<void>;
  /** Çok firmalı kurulumda firma adresleri (giriş istekleri bu kökenlerden de kabul edilir). */
  trustedOrigins?: () => Promise<string[]>;
};

export function createAuth(db: Db, opts: AuthOptions) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    ...(opts.trustedOrigins ? { trustedOrigins: async () => [opts.baseURL, ...(await opts.trustedOrigins!())] } : {}),
    appName: opts.issuer,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, twoFactor: twoFactorTable, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // hesaplar yalnızca kurulum komutu ve davetle açılır
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      sendResetPassword: opts.sendResetPassword ? (data) => opts.sendResetPassword!(data) : undefined,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] }, useSecureCookies: opts.baseURL.startsWith('https://') },
    plugins: [twoFactor({ issuer: opts.issuer, backupCodeOptions: { amount: 10 } }), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Firmaya ayrı veritabanında üyelik kullanıcıya bağlıdır: kimliğin bir kopyası (parolasız) firma veritabanına yazılır. */
export async function mirrorUser(auth: Auth, db: Db, userId: string): Promise<void> {
  const u = await (await auth.$context).internalAdapter.findUserById(userId);
  if (!u) throw new Error('Kullanıcı bulunamadı.');
  await db.insert(user).values({ id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, createdAt: u.createdAt, updatedAt: u.updatedAt }).onConflictDoNothing();
}

// Herkese açık kayıt kapalı olduğundan hesaplar sunucu tarafında oluşturulur.
export async function createUserWithPassword(auth: Auth, input: { email: string; name: string; password: string }): Promise<{ id: string }> {
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error(`Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();
  const created = await ctx.internalAdapter.createUser({ email, name: input.name, emailVerified: true }, { method: 'admin' });
  await ctx.internalAdapter.linkAccount({ userId: created.id, providerId: 'credential', accountId: created.id, password: await ctx.password.hash(input.password) });
  return { id: created.id };
}
