import { describe, expect, it } from 'vitest';
import { parseInstallConfig } from '@/core/install-config';
import { enabledModules, requireModule } from '@/core/modules/registry';

const base = { company: { name: 'Karviyes Ambalaj', slug: 'karviyes' }, sector: 'bags' };

describe('kurulum ayarı ve modüller', () => {
  it('production, orders olmadan açılamaz', () => {
    expect(() => parseInstallConfig({ ...base, modules: ['production'] })).toThrow(/production modülü orders modülüne bağlı/);
  });

  it('bilinmeyen modül reddedilir', () => {
    expect(() => parseInstallConfig({ ...base, modules: ['orders', 'uzay'] })).toThrow(/uzay/);
  });

  it('2FA zorunlu roller varsayılanı yönetici, muhasebe ve üretim takip', () => {
    expect(parseInstallConfig({ ...base, modules: ['orders'] }).security.twoFactorRequiredRoles).toEqual(['admin', 'accounting', 'tracking']);
  });

  it('açık modüller bağımlılık sırasıyla döner', () => {
    const cfg = parseInstallConfig({ ...base, modules: ['production', 'orders'] });
    expect(enabledModules(cfg).map((m) => m.id)).toEqual(['orders', 'production']);
  });

  it('kapalı modül MODULE_DISABLED verir', () => {
    const cfg = parseInstallConfig({ ...base, modules: ['orders'] });
    expect(() => requireModule('production', cfg)).toThrow(expect.objectContaining({ code: 'MODULE_DISABLED' }));
    expect(() => requireModule('orders', cfg)).not.toThrow();
  });
});
