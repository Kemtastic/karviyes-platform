import { eq } from 'drizzle-orm';
import { createUserWithPassword, MIN_PASSWORD_LENGTH, type Auth } from '@/core/auth/auth';
import { addMembership } from '@/core/auth/session';
import type { Db } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { companies, memberships } from '@/core/db/schema';
import type { InstallConfig } from '@/core/install-config';

export type SetupInput = {
  db: Db;
  auth: Auth;
  cfg: InstallConfig;
  admin: { email: string; name: string; password: string };
  migrate: () => Promise<void>;
};

// Tekrar çalıştırılması güvenli: göçler, firma (slug ile) ve ilk yönetici.
export async function runSetup({ db, auth, cfg, admin, migrate }: SetupInput): Promise<{ companyId: string; created: boolean }> {
  await migrate();

  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, cfg.company.slug));
  const companyId = existing
    ? existing.id
    : (await db.insert(companies).values({ name: cfg.company.name, slug: cfg.company.slug, brandColor: cfg.company.brandColor }).returning({ id: companies.id }))[0]!.id;

  const ctx = await auth.$context;
  const email = admin.email.trim().toLowerCase();
  const found = await ctx.internalAdapter.findUserByEmail(email);
  let created = false;
  let userId: string;
  if (found) {
    userId = found.user.id;
  } else {
    if (admin.password.length < MIN_PASSWORD_LENGTH) throw new Error(`Yönetici parolası en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
    userId = (await createUserWithPassword(auth, { email, name: admin.name, password: admin.password })).id;
    created = true;
  }

  const [membership] = await withCompany(companyId, (tx) => tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId)), db);
  if (!membership) await addMembership(db, companyId, { userId, roles: ['admin'], kind: 'person' });

  return { companyId, created };
}
