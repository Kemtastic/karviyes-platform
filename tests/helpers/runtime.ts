import type { ActionRuntime } from '@/core/action';
import type { CurrentUser } from '@/core/auth/session';
import { parseInstallConfig } from '@/core/install-config';
import type { Role } from '@/core/modules/types';
import type { TestDb } from './db';

export const testConfig = parseInstallConfig({ company: { name: 'Test Firma', slug: 'test' }, modules: ['orders', 'production'], sector: 'bags' });

export function testUser(companyId: string, roles: Role[], over: Partial<CurrentUser> = {}): CurrentUser {
  return {
    userId: `u-${roles.join('-')}`,
    email: 'kullanici@example.com',
    name: 'Test Kullanıcı',
    companyId,
    membershipId: '00000000-0000-0000-0000-000000000000',
    roles,
    kind: 'person',
    staffId: null,
    twoFactorEnabled: true,
    ...over,
  };
}

export function runtime(t: TestDb, user: CurrentUser | null): ActionRuntime {
  return { user, db: t.db, cfg: testConfig };
}
