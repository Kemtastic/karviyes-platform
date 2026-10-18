import { describe, expect, it } from 'vitest';
import { addMoney, applyRate, formatMoney, money, moneyFromJSON, moneyToJSON, mulPrice, parseMoney } from '@/core/money';

describe('mulPrice — birim fiyat × miktar, kuruş, yarım sıfırdan uzağa', () => {
  it('8,75 × 6666 = 58.327,50', () => expect(mulPrice('8.7500', 6666)).toBe(5832750n));
  it('0,005 → 1 kuruş', () => expect(mulPrice('0.0050', 1)).toBe(1n));
  it('0,0049 → 0 kuruş', () => expect(mulPrice('0.0049', 1)).toBe(0n));
  it('−0,005 → −1 kuruş', () => expect(mulPrice('-0.0050', 1)).toBe(-1n));
});

describe('applyRate — yüzde uygulama', () => {
  it('%10 KDV', () => expect(applyRate(5832750n, 10)).toBe(583275n));
  it('yarım kuruş yukarı', () => expect(applyRate(1n, 50)).toBe(1n));
  it('ondalıklı oran metinle', () => expect(applyRate(10000n, '18.5')).toBe(1850n));
});

describe('formatMoney', () => {
  it('TRY', () => expect(formatMoney(money(123456n, 'TRY'))).toBe('1.234,56 ₺'));
  it('negatif', () => expect(formatMoney(money(-5n, 'TRY'))).toBe('−0,05 ₺'));
  it('USD ve EUR', () => {
    expect(formatMoney(money(123456n, 'USD'))).toBe('1.234,56 $');
    expect(formatMoney(money(100n, 'EUR'))).toBe('1,00 €');
  });
});

describe('parseMoney', () => {
  it('Türkçe biçim', () => expect(parseMoney('1.234,5', 'TRY').minor).toBe(123450n));
  it('noktalı ondalık', () => expect(parseMoney('1234.56', 'TRY').minor).toBe(123456n));
  it('üç ondalık hanesi reddedilir', () => expect(() => parseMoney('1,234', 'TRY')).toThrow());
  it('harf reddedilir', () => expect(() => parseMoney('12a', 'TRY')).toThrow());
});

describe('büyük tutar ve para birimi', () => {
  it('2^53 üstü kuruş doğru toplanır ve JSON metin olur', () => {
    const sum = addMoney(money(9007199254740993n, 'TRY'), money(1n, 'TRY'));
    expect(sum.minor).toBe(9007199254740994n);
    expect(moneyToJSON(sum)).toEqual({ minor: '9007199254740994', currency: 'TRY' });
    expect(moneyFromJSON(moneyToJSON(sum))).toEqual(sum);
  });
  it('farklı para birimi toplanamaz', () => {
    expect(() => addMoney(money(1n, 'TRY'), money(1n, 'USD'))).toThrow(expect.objectContaining({ code: 'CURRENCY_MISMATCH' }));
  });
});
