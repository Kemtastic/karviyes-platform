import { inArray } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { memberships, staff, user } from '@/core/db/schema';
import type { Role } from '@/core/modules/types';

export type MemberRow = { id: string; userId: string; name: string; email: string; roles: Role[]; kind: 'person' | 'device'; active: boolean; version: number; twoFactorEnabled: boolean };

export async function listMembers(companyId: string): Promise<MemberRow[]> {
  // Üyelikler firmanın veri veritabanında, kimlik (ad, e-posta) ana veritabanında.
  const db = await getDb();
  const ms = await withCompany(companyId, (tx) => tx.select().from(memberships));
  if (!ms.length) return [];
  // Kimlik tabloları firmalar arası; yalnızca bu firmanın üyelerinin adı ve e-postası okunur.
  const users = await db.select({ id: user.id, name: user.name, email: user.email, twoFactorEnabled: user.twoFactorEnabled }).from(user).where(inArray(user.id, ms.map((m) => m.userId)));
  const byId = new Map(users.map((u) => [u.id, u]));
  return ms
    .map((m) => ({ id: m.id, userId: m.userId, name: byId.get(m.userId)?.name ?? '?', email: byId.get(m.userId)?.email ?? '?', roles: m.roles as Role[], kind: m.kind, active: m.active, version: m.version, twoFactorEnabled: Boolean(byId.get(m.userId)?.twoFactorEnabled) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export async function listStaff(companyId: string) {
  const rows = await withCompany(companyId, (tx) => tx.select().from(staff));
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
