import type { ModuleManifest } from '@/core/modules/types';

export const ordersManifest: ModuleManifest = {
  id: 'orders',
  name: 'Siparişler',
  dependsOn: [],
  nav: [{ href: '/siparisler', label: 'Siparişler', roles: ['admin', 'sales', 'tracking'], icon: 'clipboard-list' }],
};
