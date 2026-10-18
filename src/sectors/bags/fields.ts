import type { SectorField } from '../types';

export const SHAPES = ['Körüksüz', 'Alt Körüklü', '3D', 'Üçgen Kesim'];
export const HANDLES = ['El Geçme', 'İpli', 'Kulplu', 'Kese'];

// Eski sipariş formundaki alanlar ve etiketler (sırası korunur).
export const BAG_FIELDS: SectorField[] = [
  { key: 'width', label: 'En', type: 'number', unit: 'cm', required: true, min: 1, max: 300 },
  { key: 'height', label: 'Boy', type: 'number', unit: 'cm', required: true, min: 1, max: 300 },
  { key: 'shape', label: 'Model', type: 'select', options: SHAPES, required: true },
  { key: 'gusset', label: 'Körük', type: 'number', unit: 'cm', min: 0, max: 100, hint: 'Körüksüz modelde 0' },
  { key: 'biyeType', label: 'Biye', type: 'select', options: ['Biyeli', 'Biyesiz'] },
  { key: 'biye', label: 'Biye payı', type: 'number', unit: 'cm', min: 0, max: 20 },
  { key: 'handle', label: 'Tutma yeri', type: 'select', options: HANDLES, required: true },
  { key: 'handleLength', label: 'Kulp uzunluğu', type: 'number', unit: 'cm', min: 1, max: 1000, hint: 'Kulplu modelde zorunlu' },
  { key: 'colour', label: 'Kumaş rengi', type: 'text', required: true },
  { key: 'gsm', label: 'Gramaj', type: 'integer', unit: 'gr/m²', required: true, min: 10, max: 500 },
  { key: 'handleColour', label: 'Kulp rengi', type: 'text' },
  { key: 'handleGsm', label: 'Kulp gramajı', type: 'integer', unit: 'gr/m²', min: 10, max: 500, hint: 'Boşsa herhangi gramaj' },
  { key: 'noPrint', label: 'Baskısız', type: 'boolean' },
  { key: 'print', label: 'Baskı renkleri', type: 'text', hint: 'Renkleri · ile ayırın' },
  { key: 'rolls', label: 'Bobin sayısı', type: 'integer', required: true, min: 1, max: 1000 },
];

export const WASTE_FIELDS: SectorField[] = [
  { key: 'good', label: 'Sağlam adet', type: 'integer', required: true, min: 0 },
  { key: 'waste', label: 'Fire adet', type: 'integer', min: 0 },
];
