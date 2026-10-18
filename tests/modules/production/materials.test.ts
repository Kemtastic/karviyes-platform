import { describe, expect, it } from 'vitest';
import { findShortages } from '@/modules/production/domain/materials';

describe('stok açığı hesabı', () => {
  it('ihtiyaçlar renk/en/gramaja göre toplanır; boştaki uygun bobinler düşülür; daha geniş bobin dilimleme seçeneğidir', () => {
    const demands = [
      { ref: 'S-1', kind: 'fabric' as const, label: 'Kumaş', widthCm: 100, colour: 'Krem', gsm: 70, rolls: 2, consumeAt: null },
      { ref: 'S-2', kind: 'fabric' as const, label: 'Kumaş', widthCm: 100, colour: ' krem ', gsm: 70, rolls: 1, consumeAt: null },
      { ref: 'S-1', kind: 'handle' as const, label: 'Sap', widthCm: 5, colour: 'Kırmızı', gsm: null, rolls: 2, consumeAt: 'cutting' },
    ];
    const stock = [
      { widthCm: 100, colour: 'KREM', gsm: 70 },
      { widthCm: 120, colour: 'Krem', gsm: 70 },
      { widthCm: 5, colour: 'kırmızı', gsm: 80 },
      { widthCm: 100, colour: 'Krem', gsm: 90 },
    ];
    expect(findShortages(demands, stock)).toEqual([
      { kind: 'fabric', label: 'Kumaş', widthCm: 100, colour: 'Krem', gsm: 70, required: 3, available: 1, missing: 2, refs: ['S-1', 'S-2'], canSlit: true },
      { kind: 'handle', label: 'Sap', widthCm: 5, colour: 'Kırmızı', gsm: null, required: 2, available: 1, missing: 1, refs: ['S-1'], canSlit: false },
    ]);
  });

  it('yeterli stok varsa açık yok', () => {
    expect(findShortages([{ ref: 'S-1', kind: 'fabric', label: 'Kumaş', widthCm: 100, colour: 'Krem', gsm: 70, rolls: 1, consumeAt: null }], [{ widthCm: 100, colour: 'Krem', gsm: 70 }])).toEqual([]);
  });
});
