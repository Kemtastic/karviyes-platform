export type PackagingInput = { type: 'sack' | 'box' | 'none'; capacity: number };
export type PackagingPlan = PackagingInput & { packages: number };

export const PACKAGING_LABELS: Record<PackagingInput['type'], string> = { sack: 'Çuval', box: 'Koli', none: 'Paketsiz' };

export function packagingPlan(input: PackagingInput, quantity: number): PackagingPlan {
  if (input.type === 'none') return { type: 'none', capacity: 0, packages: 0 };
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) throw new Error('Paket kapasitesi 0’dan büyük tam sayı olmalı.');
  return { ...input, packages: Math.ceil(quantity / input.capacity) };
}
