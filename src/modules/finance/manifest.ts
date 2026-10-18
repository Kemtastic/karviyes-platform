import type { ModuleManifest } from '@/core/modules/types';

const FIN = ['admin', 'accounting'] as const;

export const financeManifest: ModuleManifest = {
  id: 'finance',
  name: 'Ön Muhasebe',
  dependsOn: [],
  nav: [
    { href: '/muhasebe', label: 'Muhasebe Özeti', roles: [...FIN], icon: 'chart' },
    { href: '/muhasebe/cariler', label: 'Cari Bakiyeler', roles: [...FIN], icon: 'users' },
    { href: '/muhasebe/faturalar', label: 'Fatura Kayıtları', roles: [...FIN], icon: 'receipt' },
    { href: '/muhasebe/hareketler', label: 'Tahsilat ve Ödemeler', roles: [...FIN], icon: 'banknote' },
    { href: '/muhasebe/hesaplar', label: 'Kasa ve Banka', roles: [...FIN], icon: 'landmark' },
    { href: '/muhasebe/cekler', label: 'Çekler', roles: [...FIN], icon: 'scroll' },
    { href: '/muhasebe/mutabakat', label: 'Mutabakat', roles: [...FIN], icon: 'handshake' },
  ],
};
