import type { ModuleManifest } from '@/core/modules/types';

export const ordersManifest: ModuleManifest = {
  id: 'orders',
  name: 'Siparişler',
  dependsOn: [],
  nav: [
    { href: '/siparisler', label: 'Siparişler', roles: ['admin', 'sales', 'tracking'], icon: 'clipboard-list' },
    { href: '/siparisler/alacaklar', label: 'Sipariş Bakiyeleri', roles: ['admin', 'sales', 'tracking'], icon: 'wallet' },
    { href: '/siparisler/raporlar', label: 'Satış Raporları', roles: ['admin', 'sales', 'tracking'], icon: 'chart' },
  ],
};
