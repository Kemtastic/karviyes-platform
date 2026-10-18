import { AppError } from '@/core/errors';
import type { SectorField, SectorPackage, StageDef, StageId } from '../types';
import { calculatePlastic, type PlasticCalc } from './calculate';

export const TYPES = ['Atlet', 'Düz', 'Körüklü', 'Çöp torbası'];
export const MATERIALS = ['HDPE', 'LDPE', 'LLDPE'];

export type PlasticProduct = {
  type: string;
  width: number;
  height: number;
  gusset: number;
  micron: number;
  material: string;
  colour: string;
  printColours: number;
  print: string;
  unit: 'adet' | 'kg';
  amount: number;
  tolerancePct: number;
  packPer: number;
};

const FIELDS: SectorField[] = [
  { key: 'type', label: 'Poşet tipi', type: 'select', options: TYPES, required: true },
  { key: 'width', label: 'En', type: 'number', unit: 'cm', required: true, min: 5, max: 200 },
  { key: 'height', label: 'Boy', type: 'number', unit: 'cm', required: true, min: 5, max: 300 },
  { key: 'gusset', label: 'Körük', type: 'number', unit: 'cm', min: 0, max: 60, hint: 'Yalnız körüklü tipte' },
  { key: 'micron', label: 'Kalınlık', type: 'integer', unit: 'µ', required: true, min: 6, max: 250 },
  { key: 'material', label: 'Hammadde', type: 'select', options: MATERIALS, required: true },
  { key: 'colour', label: 'Film rengi', type: 'text', hint: 'Masterbatch rengi; boşsa natürel' },
  { key: 'printColours', label: 'Baskı renk sayısı', type: 'integer', min: 0, max: 8, hint: '0 = baskısız' },
  { key: 'print', label: 'Baskı renkleri', type: 'text', hint: 'Renkleri · ile ayırın' },
  { key: 'unit', label: 'Miktar birimi', type: 'select', options: ['adet', 'kg'], required: true },
  { key: 'amount', label: 'Miktar', type: 'number', required: true, min: 1, max: 100_000_000 },
  { key: 'tolerancePct', label: 'Tolerans', type: 'number', unit: '%', min: 0, max: 20, hint: 'Teslimde ± sapma payı' },
  { key: 'packPer', label: 'Koli içi adet', type: 'integer', min: 0, max: 100000 },
];

const KG = (key: string, label: string, required = false): SectorField => ({ key, label, type: 'number', unit: 'kg', min: 0, required });
const GOOD: SectorField = { key: 'good', label: 'Sağlam adet', type: 'integer', required: true, min: 0 };

// Aşama kimlikleri üretim modülünün bölüm yuvalarıdır; etiketleri bu sektöre göre.
const STAGES: StageDef[] = [
  { id: 'slitting', label: 'Ekstrüzyon', role: 'slitting', finishFields: [KG('kg', 'Üretilen film', true), KG('wasteKg', 'Fire'), { key: 'metres', label: 'Metre', type: 'number', unit: 'm', min: 0 }] },
  { id: 'printing', label: 'Baskı', role: 'printing', finishFields: [KG('kg', 'Basılan film'), KG('wasteKg', 'Baskı firesi')] },
  { id: 'cutting', label: 'Kesim-Kaynak', role: 'cutting', finishFields: [GOOD, KG('wasteKg', 'Fire')] },
  { id: 'finishing', label: 'Paketleme', role: 'finishing', finishFields: [GOOD, KG('kg', 'Net ağırlık')] },
  { id: 'repair', label: 'Ayıklama', role: 'repair', finishFields: [GOOD, KG('wasteKg', 'Fire')] },
];

function validate(input: Record<string, unknown>): PlasticProduct {
  const errors: Record<string, string> = {};
  const num = (k: string, opts: { required?: boolean; int?: boolean; min?: number; max?: number; label: string }) => {
    const raw = input[k];
    if (raw === undefined || raw === null || raw === '') {
      if (opts.required) errors[k] = `${opts.label} zorunlu.`;
      return 0;
    }
    const v = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(v) || (opts.int && !Number.isInteger(v))) errors[k] = `${opts.label}: ${opts.int ? 'tam sayı' : 'sayı'} girin.`;
    else if (opts.min !== undefined && v < opts.min) errors[k] = `${opts.label} en az ${opts.min} olmalı.`;
    else if (opts.max !== undefined && v > opts.max) errors[k] = `${opts.label} en çok ${opts.max} olabilir.`;
    return v;
  };
  const text = (k: string) => String(input[k] ?? '').trim();
  const type = text('type') || 'Düz';
  if (!TYPES.includes(type)) errors.type = 'Listeden bir tip seçin.';
  const material = text('material') || 'LDPE';
  if (!MATERIALS.includes(material)) errors.material = 'Listeden bir hammadde seçin.';
  const width = num('width', { required: true, min: 5, max: 200, label: 'En' });
  const height = num('height', { required: true, min: 5, max: 300, label: 'Boy' });
  const gusset = num('gusset', { min: 0, max: 60, label: 'Körük' });
  if (type === 'Körüklü' && gusset <= 0) errors.gusset = 'Körüklü tipte körük girin.';
  if (type !== 'Körüklü' && gusset !== 0) errors.gusset = 'Körük yalnız körüklü tipte girilir.';
  const micron = num('micron', { required: true, int: true, min: 6, max: 250, label: 'Kalınlık' });
  const printColours = num('printColours', { int: true, min: 0, max: 8, label: 'Baskı renk sayısı' });
  const print = printColours > 0 ? text('print') : '';
  if (printColours > 0 && !print) errors.print = 'Baskı renklerini yazın veya renk sayısını 0 yapın.';
  const unit = input.unit === 'kg' ? 'kg' : 'adet';
  const amount = num('amount', { required: true, min: 1, max: 100_000_000, label: 'Miktar' });
  if (unit === 'adet' && !Number.isInteger(amount)) errors.amount = 'Adet tam sayı olmalı.';
  const tolerancePct = num('tolerancePct', { min: 0, max: 20, label: 'Tolerans' });
  const packPer = num('packPer', { int: true, min: 0, max: 100000, label: 'Koli içi adet' });
  if (Object.keys(errors).length) throw new AppError('VALIDATION', 'Ürün bilgilerini düzeltin.', errors);
  return { type, width, height, gusset, micron, material, colour: text('colour'), printColours, print, unit, amount, tolerancePct, packPer };
}

export const plasticBags: SectorPackage<PlasticProduct, PlasticCalc> = {
  id: 'plastic-bags',
  name: 'Plastik poşet',
  productFields: FIELDS,
  validateProduct: validate,
  calculate: calculatePlastic,
  targetQuantity: (p) => calculatePlastic(p).target,
  stages: STAGES,
  roleLabels: { slitting: 'Ekstrüzyon', cutting: 'Kesim-Kaynak', finishing: 'Paketleme', repair: 'Ayıklama' },
  firstStages: () => ['slitting'],
  nextStages(p, current: StageId) {
    switch (current) {
      case 'slitting':
        return p.printColours > 0 ? ['printing'] : ['cutting'];
      case 'printing':
        return ['cutting'];
      case 'cutting':
      case 'repair':
        return ['finishing'];
      default:
        return [];
    }
  },
  // Baskılı iş baskıdan geçmeden kesime gidemez.
  canSkipTo: (p, target) => target !== 'cutting' || p.printColours === 0,
  canTurn: () => false,
  // Granül (kg) stoğu pilot firmayla eklenecek; şimdilik bobin malzemesi yok, iş doğrudan ekstrüzyona gider.
  materials: () => [],
  defaults: { type: 'Atlet', material: 'HDPE', unit: 'adet', printColours: '1', tolerancePct: '10', gusset: '0', micron: '25' },
  summary: (c) => [
    { label: 'Ağırlık', value: `${c.gram.toLocaleString('tr-TR')} g/adet` },
    { label: 'Net', value: `${c.netKg.toLocaleString('tr-TR')} kg` },
    { label: 'Hammadde (fireli)', value: `${c.rawKg.toLocaleString('tr-TR')} kg` },
    { label: 'Hedef', value: `${c.target.toLocaleString('tr-TR')} adet` },
  ],
  analysisKey: (p) => `${p.type} ${p.width}×${p.height}${p.gusset ? `+${p.gusset}` : ''} cm · ${p.micron} µ · ${p.material}`,
  describe: (p) => {
    const c = calculatePlastic(p);
    return [
      `${p.type} ${p.width}×${p.height}${p.gusset ? `+${p.gusset}` : ''} cm`,
      `${p.micron} µ ${p.material}`,
      p.colour || 'natürel',
      p.printColours > 0 ? `${p.printColours} renk baskı: ${p.print}` : 'baskısız',
      `${c.gram.toLocaleString('tr-TR')} g/adet`,
    ].join(' · ');
  },
};
