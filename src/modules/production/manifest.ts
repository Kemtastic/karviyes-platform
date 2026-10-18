import type { ModuleManifest } from '@/core/modules/types';

export const productionManifest: ModuleManifest = {
  id: 'production',
  name: 'Üretim',
  dependsOn: ['orders'],
  nav: [
    { href: '/uretim', label: 'Üretim Panosu', roles: ['admin', 'tracking', 'sales'], icon: 'factory' },
    { href: '/uretim/bolum', label: 'Bölüm Ekranı', roles: ['slitting', 'printing', 'cutting', 'finishing', 'repair', 'admin', 'tracking'], icon: 'hammer' },
    { href: '/uretim/kumas', label: 'Kumaş Stoğu', roles: ['admin', 'tracking'], icon: 'layers' },
    { href: '/uretim/klise', label: 'Klişeler', roles: ['admin', 'tracking', 'sales'], icon: 'stamp' },
    { href: '/uretim/sevk', label: 'Sevk Geçmişi', roles: ['admin', 'tracking', 'sales'], icon: 'truck' },
    { href: '/uretim/raporlar', label: 'Raporlar', roles: ['admin', 'tracking'], icon: 'chart' },
    { href: '/uretim/icgoruler', label: 'Üretim İçgörüleri', roles: ['admin', 'tracking', 'accounting'], icon: 'chart' },
  ],
};
