import { getSector } from '@/sectors';

export const STATUS_LABELS: Record<string, string> = {
  waiting: 'Üretim bekliyor',
  review: 'Kontrol bekliyor',
  completed: 'Faturaya hazır',
  shipped: 'Sevk edildi',
  cancelled: 'İptal',
};

export function stageLabel(sectorId: string, stage: string): string {
  return getSector(sectorId).stages.find((s) => s.id === stage)?.label ?? STATUS_LABELS[stage] ?? stage;
}

export const EVENT_LABELS: Record<string, string> = {
  created: 'Üretime alındı',
  fabric_reserved: 'Kumaş ayrıldı',
  sent: 'Bölüme gönderildi',
  started: 'Başlatıldı',
  finished: 'Bitirildi',
  to_repair: 'Tamire gönderildi',
  to_turning: 'Çevirmeye gönderildi',
  approved: 'Kontrol onaylandı',
  returned: 'Kontrolden geri gönderildi',
  shipped: 'Sevk edildi',
  cancelled: 'İptal edildi',
};
