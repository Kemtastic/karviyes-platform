import { describe, expect, it } from 'vitest';
import { deriveOrderStatus, orderTotalMinor, type LineStatus } from '@/modules/orders/domain/lines';

describe('sipariş durumu satırlardan türetilir', () => {
  it.each<[string, LineStatus[], string]>([
    ['hiç satır üretimde değil', ['open', 'open'], 'draft'],
    ['bir satır üretimde', ['in_production', 'open'], 'in_production'],
    ['bir satır bitti, biri bekliyor', ['done', 'open'], 'in_production'],
    ['tüm satırlar bitti', ['done', 'done'], 'ready_to_invoice'],
    ['biri bitti biri iptal', ['done', 'cancelled'], 'ready_to_invoice'],
    ['tümü iptal', ['cancelled', 'cancelled'], 'cancelled'],
    ['biri iptal biri üretimde', ['cancelled', 'in_production'], 'in_production'],
    ['biri iptal biri açık', ['cancelled', 'open'], 'draft'],
  ])('%s', (_name, lines, expected) => {
    expect(deriveOrderStatus('draft', lines)).toBe(expected);
  });

  it('faturalanmış sipariş durumunu korur', () => {
    expect(deriveOrderStatus('invoiced', ['done', 'cancelled'])).toBe('invoiced');
  });
});

describe('sipariş toplamı', () => {
  it('iptal edilen satır toplama girmez', () => {
    expect(orderTotalMinor([{ status: 'open', totalMinor: 1000n }, { status: 'cancelled', totalMinor: 500n }, { status: 'done', totalMinor: 250n }])).toBe(1250n);
  });
});

describe('tamamı iptal edilen sipariş', () => {
  it('son tutarını korur (listede ne iptal edildiği görünsün; bakiye durumdan sıfırlanır)', () => {
    expect(orderTotalMinor([{ status: 'cancelled', totalMinor: 1000n }, { status: 'cancelled', totalMinor: 500n }])).toBe(1500n);
  });
});
