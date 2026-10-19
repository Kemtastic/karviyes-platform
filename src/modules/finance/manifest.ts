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
    { href: '/muhasebe/tekrarlayan', label: 'Tekrarlayan Kayıtlar', roles: [...FIN], icon: 'repeat' },
    { href: '/muhasebe/personel', label: 'Personel Carisi', roles: [...FIN], icon: 'id-card' },
    { href: '/muhasebe/mutabakat', label: 'Mutabakat', roles: [...FIN], icon: 'handshake' },
    { href: '/muhasebe/raporlar', label: 'Gelir-Gider ve Nakit', roles: [...FIN], icon: 'chart' },
    { href: '/muhasebe/ba-bs', label: 'Ba-Bs Hazırlık', roles: [...FIN], icon: 'receipt' },
  ],
};
