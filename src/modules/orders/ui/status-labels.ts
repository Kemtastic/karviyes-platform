// İstemci bileşenleri sunucu sorgu dosyasını içe aktarmasın diye ayrı tutulur.
export const ORDER_STATUS_LABELS = {
  draft: 'Yeni sipariş',
  in_production: 'Üretimde',
  ready_to_invoice: 'Faturaya hazır',
  invoiced: 'Faturalandı',
  cancelled: 'İptal',
} as const;
