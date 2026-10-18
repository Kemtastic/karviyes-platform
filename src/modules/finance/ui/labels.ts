import type { Tone } from '@/ui/badge';

export const MOVEMENT_LABELS: Record<string, string> = { collection: 'Tahsilat', payment: 'Ödeme', expense: 'Masraf', income: 'Diğer gelir', transfer: 'Virman', check: 'Çek' };
export const MOVEMENT_TONES: Record<string, Tone> = { collection: 'success', payment: 'warning', expense: 'danger', income: 'success', transfer: 'neutral', check: 'info' };
export const CHECK_LABELS: Record<string, string> = { portfolio: 'Portföyde', collected: 'Tahsil edildi', endorsed: 'Ciro edildi', returned: 'İade / karşılıksız', issued: 'Verildi', paid: 'Ödendi', cancelled: 'Geri alındı' };
export const CHECK_TONES: Record<string, Tone> = { portfolio: 'brand', collected: 'success', endorsed: 'info', returned: 'danger', issued: 'warning', paid: 'success', cancelled: 'muted' };
export const AGING_LABELS: Record<string, string> = { unplanned: 'Vadesiz', current: 'Vadesi gelmemiş', d1_30: '1–30 gün', d31_60: '31–60 gün', d61_90: '61–90 gün', d91_120: '91–120 gün', d120p: '120+ gün' };
export const ACCOUNT_KIND_LABELS: Record<string, string> = { cash: 'Kasa', bank: 'Banka' };
