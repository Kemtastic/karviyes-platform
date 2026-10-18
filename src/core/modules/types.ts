export const ROLES = ['admin', 'sales', 'accounting', 'tracking', 'slitting', 'printing', 'cutting', 'finishing', 'repair'] as const;
export type Role = (typeof ROLES)[number];

export const DEPARTMENT_ROLES = ['slitting', 'printing', 'cutting', 'finishing', 'repair'] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Yönetici',
  sales: 'Satış',
  accounting: 'Muhasebe',
  tracking: 'Üretim Takip',
  slitting: 'Dilimleme',
  printing: 'Baskı',
  cutting: 'Kesim',
  finishing: 'Bitiş',
  repair: 'Tamir',
};

export const MODULE_IDS = ['orders', 'production', 'sales', 'finance'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export type NavItem = { href: string; label: string; roles: Role[]; icon: string };

export type ModuleManifest = {
  id: ModuleId;
  name: string;
  dependsOn: ModuleId[];
  nav: NavItem[];
};
