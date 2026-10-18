import type { InstallConfig } from '@/core/install-config';
import { enabledModules } from '@/core/modules/registry';
import type { NavItem, Role } from '@/core/modules/types';

const OFFICE: Role[] = ['admin', 'sales', 'accounting', 'tracking'];

const CORE_TOP: NavItem[] = [
  { href: '/', label: 'Ana Sayfa', roles: OFFICE, icon: 'home' },
  { href: '/cariler', label: 'Cariler', roles: OFFICE, icon: 'users' },
];

const CORE_SETTINGS: NavItem[] = [
  { href: '/ayarlar/kullanicilar', label: 'Kullanıcılar', roles: ['admin'], icon: 'shield' },
  { href: '/ayarlar/personel', label: 'Personel', roles: ['admin'], icon: 'id-card' },
  { href: '/ayarlar/firma', label: 'Firma Ayarları', roles: ['admin'], icon: 'building' },
  { href: '/ayarlar/denetim', label: 'Denetim Kaydı', roles: ['admin'], icon: 'history' },
];

// Kullanıcının rollerine ve kurulumda açık modüllere göre menü.
export function navFor(roles: Role[], cfg: InstallConfig): NavItem[] {
  const all = [...CORE_TOP, ...enabledModules(cfg).flatMap((m) => m.nav), ...CORE_SETTINGS];
  return all.filter((item) => item.roles.some((r) => roles.includes(r)));
}
