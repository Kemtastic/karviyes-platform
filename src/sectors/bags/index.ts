import { AppError } from '@/core/errors';
import type { MaterialNeed, SectorPackage, StageDef, StageId } from '../types';
import { calculateBag, type BagCalc } from './calculate';
import { BAG_FIELDS, HANDLES, SHAPES, WASTE_FIELDS } from './fields';

export type BagProduct = {
  width: number;
  height: number;
  shape: string;
  gusset: number;
  biyeType: 'with' | 'without';
  biye: number;
  handle: string;
  handleLength: number;
  colour: string;
  gsm: number;
  handleColour: string;
  handleGsm: number;
  noPrint: boolean;
  print: string;
  rolls: number;
  rollMetres: number;
};

const STAGES: StageDef[] = [
  { id: 'slitting', label: 'Dilimleme', role: 'slitting', finishFields: [{ key: 'metres', label: 'Dilimlenen metre', type: 'number', unit: 'm', min: 0 }] },
  { id: 'printing', label: 'Baskı', role: 'printing', finishFields: [{ key: 'printWaste', label: 'Baskı firesi', type: 'number', unit: 'm', min: 0 }] },
  { id: 'cutting', label: 'Kesim', role: 'cutting', finishFields: WASTE_FIELDS },
  { id: 'finishing', label: 'Kesim Bitiş', role: 'finishing', finishFields: WASTE_FIELDS },
  { id: 'repair', label: 'Tamir', role: 'repair', finishFields: WASTE_FIELDS },
  { id: 'turning', label: 'Çevirme', role: 'finishing', finishFields: WASTE_FIELDS },
];

function validate(input: Record<string, unknown>): BagProduct {
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

  const shape = text('shape') || 'Körüksüz';
  if (!SHAPES.includes(shape)) errors.shape = 'Listeden bir model seçin.';
  const handle = text('handle') || 'El Geçme';
  if (!HANDLES.includes(handle)) errors.handle = 'Listeden bir tutma yeri seçin.';
  const width = num('width', { required: true, min: 1, max: 300, label: 'En' });
  const height = num('height', { required: true, min: 1, max: 300, label: 'Boy' });
  const gusset = num('gusset', { min: 0, max: 100, label: 'Körük' });
  if (shape === 'Körüksüz' && gusset !== 0) errors.gusset = 'Körüksüz modelde körük 0 olmalı. Alt Körüklü veya 3D seçin.';
  const biyeType = input.biyeType === 'without' || input.biyeType === 'Biyesiz' ? 'without' : 'with';
  const biye = biyeType === 'without' ? 0 : num('biye', { min: 0, max: 20, label: 'Biye payı' });
  const handleLength = handle === 'Kulplu' ? num('handleLength', { required: true, min: 1, max: 1000, label: 'Kulp uzunluğu' }) : 0;
  const gsm = num('gsm', { required: true, int: true, min: 10, max: 500, label: 'Gramaj' });
  // 0 = belirtilmemiş (kayıtlı ürün yeniden doğrulanırken de geçerli).
  const handleGsm = handle === 'Kulplu' && Number(input.handleGsm) ? num('handleGsm', { int: true, min: 10, max: 500, label: 'Kulp gramajı' }) : 0;
  const rolls = num('rolls', { required: true, int: true, min: 1, max: 1000, label: 'Bobin sayısı' });
  const noPrint = input.noPrint === true || input.noPrint === 'true' || input.noPrint === 'on';
  const print = noPrint ? '' : text('print');
  if (!noPrint && !print) errors.print = 'Baskı renklerini yazın veya "Baskısız" seçin.';
  const colour = text('colour') || 'Beyaz';

  if (Object.keys(errors).length) throw new AppError('VALIDATION', 'Ürün bilgilerini düzeltin.', errors);
  return { width, height, shape, gusset, biyeType, biye, handle, handleLength, colour, gsm, handleColour: text('handleColour'), handleGsm, noPrint, print, rolls, rollMetres: 1000 };
}

// Eski sistem (lib/inventory.ts reserveHandles): kulplu çantada her 1300 adete 1 bobin 5 cm sap, kesimde tüketilir.
const BAGS_PER_HANDLE_ROLL = 1300;
const HANDLE_WIDTH_CM = 5;

function bagMaterials(p: BagProduct, quantity: number): MaterialNeed[] {
  const needs: MaterialNeed[] = [{ kind: 'fabric', label: 'Kumaş', widthCm: calculateBag(p).fabricCm, colour: p.colour, gsm: p.gsm, rolls: p.rolls, consumeAt: null }];
  if (p.handle === 'Kulplu') {
    needs.push({ kind: 'handle', label: 'Sap', widthCm: HANDLE_WIDTH_CM, colour: p.handleColour || p.colour, gsm: p.handleGsm || null, rolls: Math.ceil(quantity / BAGS_PER_HANDLE_ROLL), consumeAt: 'cutting' });
  }
  return needs;
}

export const bags: SectorPackage<BagProduct, BagCalc> = {
  id: 'bags',
  name: 'Bez çanta',
  productFields: BAG_FIELDS,
  validateProduct: validate,
  calculate: calculateBag,
  targetQuantity: (p) => calculateBag(p).target,
  stages: STAGES,
  firstStages: (p) => (p.noPrint ? ['slitting', 'cutting'] : ['slitting', 'printing']),
  nextStages(p, current: StageId) {
    switch (current) {
      case 'slitting':
        return p.noPrint ? ['cutting'] : ['printing'];
      case 'printing':
        return ['cutting'];
      case 'cutting':
        return ['finishing'];
      case 'repair':
      case 'turning':
        return ['finishing'];
      default:
        return [];
    }
  },
  // Baskılı iş baskıdan geçmeden kesime gidemez.
  canSkipTo: (p, target) => target !== 'cutting' || p.noPrint,
  canTurn: (p) => p.shape === '3D',
  materials: bagMaterials,
  describe: (p) =>
    [`${p.width}×${p.height}${p.gusset ? `×${p.gusset}` : ''} cm`, p.shape, p.handle, `${p.gsm} gr`, p.colour, p.noPrint ? 'baskısız' : `baskı: ${p.print}`].join(' · '),
};
