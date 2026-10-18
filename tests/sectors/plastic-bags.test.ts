import { describe, expect, it } from 'vitest';
import { getSector, roleLabelsFor } from '@/sectors';
import { bagGram, calculatePlastic } from '@/sectors/plastic-bags/calculate';
import { plasticBags } from '@/sectors/plastic-bags';

const atlet = { type: 'Atlet', width: 30, height: 50, gusset: 0, micron: 25, material: 'HDPE', printColours: 1, print: 'yeşil', unit: 'adet', amount: 10000, tolerancePct: 10 };

describe('plastik poşet hesapları (docs/sektor-plastik-poset.md örneği)', () => {
  it('atlet 30×50 cm, HDPE, 25 µ → 7,125 g; 10.000 adet ≈ 71,25 kg net, %3/%5/%3 fireyle ≈ 79,7 kg hammadde', () => {
    expect(bagGram(atlet)).toBeCloseTo(7.125, 6);
    const c = calculatePlastic(atlet);
    expect(c).toMatchObject({ gram: 7.125, target: 10000, netKg: 71.25, rawKg: 79.7, tolerance: 1000 });
  });

  it('kg ile sipariş adet hedefine çevrilir; baskısızda baskı firesi düşülmez; körük genişliğe eklenir', () => {
    expect(calculatePlastic({ ...atlet, unit: 'kg', amount: 100 }).target).toBe(14035);
    expect(calculatePlastic({ ...atlet, printColours: 0 }).rawKg).toBe(75.7);
    expect(bagGram({ type: 'Körüklü', width: 30, height: 50, gusset: 10, micron: 25, material: 'LDPE' })).toBeCloseTo(40 * 50 * 2 * 0.0025 * 0.92, 6);
  });
});

describe('plastik poşet paketi', () => {
  it('doğrulama: körük yalnız körüklüde, baskılıda renkler zorunlu, adet tam sayı', () => {
    expect(() => plasticBags.validateProduct({ ...atlet, gusset: 5 })).toThrow();
    expect(() => plasticBags.validateProduct({ ...atlet, type: 'Körüklü', gusset: 0 })).toThrow();
    expect(() => plasticBags.validateProduct({ ...atlet, print: '' })).toThrow();
    expect(() => plasticBags.validateProduct({ ...atlet, amount: 10.5 })).toThrow();
    expect(plasticBags.validateProduct({ ...atlet, unit: 'kg', amount: '12,5' })).toMatchObject({ unit: 'kg', amount: 12.5 });
  });

  it('akış: ekstrüzyon → (baskı) → kesim-kaynak → paketleme; baskılı iş baskıyı atlayamaz', () => {
    const p = plasticBags.validateProduct(atlet);
    const plain = plasticBags.validateProduct({ ...atlet, printColours: 0, print: '' });
    expect(plasticBags.firstStages(p)).toEqual(['slitting']);
    expect(plasticBags.nextStages(p, 'slitting')).toEqual(['printing']);
    expect(plasticBags.nextStages(plain, 'slitting')).toEqual(['cutting']);
    expect(plasticBags.canSkipTo(p, 'cutting')).toBe(false);
    expect(plasticBags.canSkipTo(plain, 'cutting')).toBe(true);
    expect(plasticBags.materials(p, 10000)).toEqual([]);
    expect(plasticBags.describe(p)).toContain('7,125 g/adet');
  });

  it('rol adları sektöre göre; kayıtlı sektörlerden alınır', () => {
    expect(getSector('plastic-bags').stages.map((s) => s.label)).toEqual(['Ekstrüzyon', 'Baskı', 'Kesim-Kaynak', 'Paketleme', 'Ayıklama']);
    expect(roleLabelsFor('plastic-bags').slitting).toBe('Ekstrüzyon');
    expect(roleLabelsFor('bags').slitting).toBe('Dilimleme');
  });
});
