import { describe, expect, it } from 'vitest';
import { mustEnrollTwoFactor, validateMembership } from '@/core/auth/policy';
import { parseInstallConfig } from '@/core/install-config';

const cfg = parseInstallConfig({ company: { name: 'K', slug: 'k' }, modules: ['orders'], sector: 'bags' });

describe('2FA zorunluluğu', () => {
  it('2FA kapalı yönetici kişi hesabı kuruluma yönlendirilir', () => {
    expect(mustEnrollTwoFactor({ kind: 'person', roles: ['admin'], twoFactorEnabled: false }, cfg)).toBe(true);
  });
  it('2FA açık yönetici yönlendirilmez', () => {
    expect(mustEnrollTwoFactor({ kind: 'person', roles: ['admin'], twoFactorEnabled: true }, cfg)).toBe(false);
  });
  it('bölüm cihaz hesabı 2FA istemez', () => {
    expect(mustEnrollTwoFactor({ kind: 'device', roles: ['printing'], twoFactorEnabled: false }, cfg)).toBe(false);
  });
  it('satış kişi hesabı varsayılan ayarda 2FA istemez', () => {
    expect(mustEnrollTwoFactor({ kind: 'person', roles: ['sales'], twoFactorEnabled: false }, cfg)).toBe(false);
  });
});

describe('üyelik kuralları', () => {
  it('cihaz hesabı tek bölüm rolüne sahip olmalı', () => {
    expect(() => validateMembership({ kind: 'device', roles: ['printing', 'cutting'] })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });
  it('cihaz hesabı bölüm dışı rol alamaz', () => {
    expect(() => validateMembership({ kind: 'device', roles: ['admin'] })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });
  it('kişi hesabı en az bir rol almalı', () => {
    expect(() => validateMembership({ kind: 'person', roles: [] })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });
  it('geçerli cihaz hesabı', () => {
    expect(() => validateMembership({ kind: 'device', roles: ['cutting'] })).not.toThrow();
  });
});
