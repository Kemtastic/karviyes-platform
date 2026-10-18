import type { Tone } from '@/ui/badge';

// İstemci bileşenleri sunucu sorgu dosyasını içe aktarmasın diye ayrı tutulur.
export const ORDER_STATUS_LABELS = {
  draft: 'Yeni sipariş',
  in_production: 'Üretimde',
  ready_to_invoice: 'Faturaya hazır',
  invoiced: 'Faturalandı',
  cancelled: 'İptal',
} as const;

export const ORDER_STATUS_TONES: Record<keyof typeof ORDER_STATUS_LABELS, Tone> = {
  draft: 'info',
  in_production: 'brand',
  ready_to_invoice: 'warning',
  invoiced: 'success',
  cancelled: 'muted',
};

export const LINE_STATUS_LABELS = {
  open: 'Üretime alınmadı',
  in_production: 'Üretimde',
  done: 'Tamamlandı',
  cancelled: 'İptal',
} as const;

export const LINE_STATUS_TONES: Record<keyof typeof LINE_STATUS_LABELS, Tone> = {
  open: 'info',
  in_production: 'brand',
  done: 'success',
  cancelled: 'muted',
};
