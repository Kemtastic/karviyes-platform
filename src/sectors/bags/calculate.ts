// Karviyes v78 lib/production.ts calculate() ile birebir aynı sonuç (tests/fixtures/bags-calculate-golden.json).
export type BagCalc = { fabricCm: number; kazan: number; perRoll: number; target: number; tolerance: number; metres: number };

export function calculateBag(p: Record<string, unknown>): BagCalc {
  const num = (k: string, fallback = 0) => Number(p[k] ?? fallback) || 0;
  const width = num('width');
  const height = num('height');
  const gusset = num('gusset');
  const biye = p.biyeType === 'without' ? 0 : num('biye');
  const rolls = num('rolls');
  const rollMetres = num('rollMetres', 1000) || 1000;
  const fabricCm = 2 * height + gusset + 2 * biye;
  const raw = width + (p.shape === '3D' ? gusset : 0);
  // 3D modelde kazan 5 cm katına yuvarlanır.
  const kazan = p.shape === '3D' ? Math.ceil(raw / 5) * 5 : raw;
  const perRoll = kazan > 0 ? (rollMetres * 100) / kazan : 0;
  return { fabricCm, kazan, perRoll, target: Math.floor(perRoll * rolls), tolerance: Math.floor(20 * rolls), metres: rolls * rollMetres };
}
