import type { ModuleManifest } from '@/core/modules/types';

export const salesManifest: ModuleManifest = {
  id: 'sales',
  name: 'Satış Takibi',
  dependsOn: [],
  nav: [{ href: '/satis', label: 'Satış Takibi', roles: ['admin', 'sales'], icon: 'phone' }],
};
