import { AppError } from '@/core/errors';
import type { InstallConfig } from '@/core/install-config';
import { DEPARTMENT_ROLES, type Role } from '@/core/modules/types';

export type AccountKind = 'person' | 'device';

export function mustEnrollTwoFactor(u: { kind: AccountKind; roles: Role[]; twoFactorEnabled: boolean }, cfg: InstallConfig): boolean {
  if (u.kind === 'device' || u.twoFactorEnabled) return false;
  return u.roles.some((r) => cfg.security.twoFactorRequiredRoles.includes(r));
}

export function validateMembership(m: { kind: AccountKind; roles: Role[] }): void {
  if (m.roles.length === 0) throw new AppError('VALIDATION', 'En az bir rol seçin.');
  if (m.kind === 'device') {
    if (m.roles.length !== 1) throw new AppError('VALIDATION', 'Bölüm hesabı yalnızca bir bölüme ait olabilir.');
    if (!(DEPARTMENT_ROLES as readonly Role[]).includes(m.roles[0]!)) throw new AppError('VALIDATION', 'Bölüm hesabına yalnızca bölüm rolü verilebilir.');
  }
}

export function assertRoles(userRoles: Role[], allowed: Role[]): void {
  if (!userRoles.some((r) => allowed.includes(r))) throw new AppError('FORBIDDEN', 'Bu işlem için yetkiniz yok.');
}
