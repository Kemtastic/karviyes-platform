import { describe, expect, it } from 'vitest';
import { money } from '@/core/money';
import { computeOrderTotal, orderBalance } from '@/modules/orders/domain/totals';
import { packagingPlan } from '@/modules/orders/domain/packaging';

describe('sipariş tutarı', () => {
  it('8,75 × 6666 + %10 KDV = 64.160,25', () => {
    expect(computeOrderTotal('8.7500', 6666, '10', 'TRY')).toEqual(money(6416025n, 'TRY'));
  });

  it('çok büyük tutar kuruş hassasiyetini kaybetmez', () => {
    const t = computeOrderTotal('999999.9999', 9_000_000, '20', 'TRY');
    // 999.999,9999 × 9.000.000 = 8.999.999.999.100,00 ₺; +%20 KDV = 10.799.999.998.920,00 ₺
    expect(t.minor).toBe(1079999999892000n);
  });

  it('bakiye: toplam − ödemeler; düzeltme satırı ters kayıt olarak hesaba girer', () => {
    const total = money(100000n, 'TRY');
    const pays = [
      { kind: 'deposit' as const, amountMinor: 30000n, currency: 'TRY' as const },
      { kind: 'payment' as const, amountMinor: 50000n, currency: 'TRY' as const },
      { kind: 'correction' as const, amountMinor: -10000n, currency: 'TRY' as const },
    ];
    expect(orderBalance(total, pays)).toEqual(money(30000n, 'TRY'));
  });
});

describe('paketleme planı', () => {
  it('çuval sayısı yukarı yuvarlanır', () => {
    expect(packagingPlan({ type: 'sack', capacity: 2000 }, 6666)).toEqual({ type: 'sack', capacity: 2000, packages: 4 });
  });
  it('kapasite 0 olamaz', () => {
    expect(() => packagingPlan({ type: 'box', capacity: 0 }, 100)).toThrow();
  });
});
