// İstemci bileşenleri sunucu sorgu dosyasını içe aktarmasın diye ayrı tutulur.
export const ORDER_STATUS_LABELS = {
  draft: 'Yeni sipariş',
  in_production: 'Üretimde',
  ready_to_invoice: 'Faturaya hazır',
  invoiced: 'Faturalandı',
  cancelled: 'İptal',
} as const;

export const LINE_STATUS_LABELS = {
  open: 'Üretime alınmadı',
  in_production: 'Üretimde',
  done: 'Tamamlandı',
  cancelled: 'İptal',
} as const;
