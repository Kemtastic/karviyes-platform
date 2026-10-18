import { AppError } from '@/core/errors';
import { applyRate, money, mulPrice, type Currency, type Money } from '@/core/money';

// KDV dahil sipariş toplamı: net = birim fiyat × adet, KDV net üzerinden; ikisi de kuruşa yuvarlanır.
export function computeOrderTotal(unitPrice: string, quantity: number, vatRate: string, currency: Currency): Money {
  const net = mulPrice(unitPrice, quantity);
  return money(net + applyRate(net, vatRate), currency);
}

export type PaymentLike = { kind: 'deposit' | 'payment' | 'correction'; amountMinor: bigint; currency: Currency };

export function orderBalance(total: Money, payments: PaymentLike[]): Money {
  let paid = 0n;
  for (const p of payments) {
    if (p.currency !== total.currency) throw new AppError('CURRENCY_MISMATCH', 'Ödeme para birimi siparişle aynı olmalı.');
    paid += p.amountMinor;
  }
  return money(total.minor - paid, total.currency);
}

// Cari bakiyeye giren sipariş tutarı: iptal edilen siparişin borcu yoktur; alınmış para müşteriye iade borcu olarak kalır.
export function receivableTotal(status: string, total: Money): Money {
  return status === 'cancelled' ? money(0n, total.currency) : total;
}

// "8,75", "1.234,5678" veya "8.75" → "8.7500" (en çok 4 ondalık).
export function parseUnitPrice(input: string): string {
  let text = input.trim().replace(/\s/g, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!m) throw new AppError('VALIDATION', 'Birim fiyat anlaşılamadı (örn. 8,75).', { unitPrice: 'Birim fiyat anlaşılamadı (örn. 8,75).' });
  return `${m[1]}.${(m[2] ?? '').padEnd(4, '0')}`;
}

export function parseRate(input: string, field: string, label: string): string {
  const text = input.trim().replace(',', '.');
  const v = Number(text);
  if (!/^\d+(\.\d{1,6})?$/.test(text) || !Number.isFinite(v)) throw new AppError('VALIDATION', `${label} geçersiz.`, { [field]: `${label} geçersiz.` });
  return text;
}
