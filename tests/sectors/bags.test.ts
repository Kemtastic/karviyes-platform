import { describe, expect, it } from 'vitest';
import golden from '../fixtures/bags-calculate-golden.json';
import { bags } from '@/sectors/bags';
import { getSector } from '@/sectors';

const printedRaw = { width: 40, height: 45, gusset: 0, biye: 5, biyeType: 'with', shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 2, colour: 'Beyaz', print: 'siyah · kırmızı', noPrint: false };
const plainRaw = { ...printedRaw, print: '', noPrint: true };
const printed = bags.validateProduct(printedRaw);
const plain = bags.validateProduct(plainRaw);

describe('bez çanta hesapları eski sistemle birebir', () => {
  it.each(golden.map((g, i) => [i, g] as const))('örnek %i', (_i, g) => {
    expect(bags.calculate(g.input)).toEqual(g.expected);
  });
});

describe('ürün doğrulama', () => {
  it('geçerli ürün normalize edilir', () => {
    const p = bags.validateProduct(printedRaw);
    expect(p).toMatchObject({ width: 40, height: 45, shape: 'Körüksüz', handle: 'El Geçme', noPrint: false });
  });

  it('körüksüz modelde körük 0 olmalı', () => {
    expect(() => bags.validateProduct({ ...printedRaw, gusset: 8 })).toThrow(expect.objectContaining({ code: 'VALIDATION', fieldErrors: expect.objectContaining({ gusset: expect.any(String) }) }));
  });

  it('bilinmeyen model ve tutma yeri reddedilir', () => {
    expect(() => bags.validateProduct({ ...printedRaw, shape: 'Kare' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    expect(() => bags.validateProduct({ ...printedRaw, handle: 'Fermuar' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  it('kulplu çantada kulp uzunluğu zorunlu', () => {
    expect(() => bags.validateProduct({ ...printedRaw, handle: 'Kulplu' })).toThrow(expect.objectContaining({ fieldErrors: expect.objectContaining({ handleLength: expect.any(String) }) }));
    expect(bags.validateProduct({ ...printedRaw, handle: 'Kulplu', handleLength: 40 })).toMatchObject({ handleLength: 40 });
  });

  it('en, boy, gramaj ve bobin zorunlu', () => {
    expect(() => bags.validateProduct({ ...printedRaw, width: '', rolls: 0 })).toThrow(expect.objectContaining({ fieldErrors: expect.objectContaining({ width: expect.any(String), rolls: expect.any(String) }) }));
  });
});

describe('aşama akışı', () => {
  it('baskılı iş: dilimleme → baskı → kesim → bitiş', () => {
    expect(bags.nextStages(printed, 'slitting')).toEqual(['printing']);
    expect(bags.nextStages(printed, 'printing')).toEqual(['cutting']);
    expect(bags.nextStages(printed, 'cutting')).toEqual(['finishing']);
  });

  it('baskısız iş dilimlemeden kesime geçer', () => {
    expect(bags.nextStages(plain, 'slitting')).toEqual(['cutting']);
  });

  it('baskılı iş doğrudan kesime gönderilemez, baskısız gönderilebilir', () => {
    expect(bags.canSkipTo(printed, 'cutting')).toBe(false);
    expect(bags.canSkipTo(plain, 'cutting')).toBe(true);
    expect(bags.firstStages(printed)).toEqual(['slitting', 'printing']);
  });

  it('çevirme yalnızca 3D işte', () => {
    expect(bags.canTurn(printed)).toBe(false);
    expect(bags.canTurn(bags.validateProduct({ ...printedRaw, shape: '3D', gusset: 10 }))).toBe(true);
  });

  it('her aşamanın sorumlu rolü ve Türkçe adı var', () => {
    expect(bags.stages.map((s) => [s.id, s.role, s.label])).toEqual([
      ['slitting', 'slitting', 'Dilimleme'],
      ['printing', 'printing', 'Baskı'],
      ['cutting', 'cutting', 'Kesim'],
      ['finishing', 'finishing', 'Kesim Bitiş'],
      ['repair', 'repair', 'Tamir'],
      ['turning', 'finishing', 'Çevirme'],
    ]);
  });

  it('sektör kayıttan bulunur', () => {
    expect(getSector('bags')).toBe(bags);
  });
});
