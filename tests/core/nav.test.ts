import { describe, expect, it } from 'vitest';
import { navFor } from '@/core/nav';
import { parseInstallConfig } from '@/core/install-config';

const full = parseInstallConfig({ company: { name: 'K', slug: 'k' }, modules: ['orders', 'production'], sector: 'bags' });
const ordersOnly = parseInstallConfig({ company: { name: 'K', slug: 'k' }, modules: ['orders'], sector: 'bags' });

describe('menü', () => {
  it('baskı bölüm hesabı yalnızca bölüm ekranını görür', () => {
    expect(navFor(['printing'], full).map((n) => n.href)).toEqual(['/uretim/bolum']);
  });

  it('yönetici ayarlar ve cariler dahil tüm menüyü görür', () => {
    const hrefs = navFor(['admin'], full).map((n) => n.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/cariler', '/siparisler', '/uretim', '/ayarlar/kullanicilar', '/ayarlar/firma']));
  });

  it('kapalı modülün menüsü görünmez', () => {
    expect(navFor(['admin'], ordersOnly).some((n) => n.href.startsWith('/uretim'))).toBe(false);
  });

  it('satışçı ayarları görmez', () => {
    expect(navFor(['sales'], full).some((n) => n.href.startsWith('/ayarlar'))).toBe(false);
  });
});
