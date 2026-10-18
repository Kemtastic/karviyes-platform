// Plastik poşet hesapları (docs/sektor-plastik-poset.md). Yoğunluk ve fire oranları tipik değerlerdir;
// pilot firmanın tartımıyla kalibre edilmelidir.
export const DENSITY: Record<string, number> = { LDPE: 0.92, HDPE: 0.95, LLDPE: 0.92 };
export const WASTE = { extrusion: 0.03, printing: 0.05, cutting: 0.03 };

export type PlasticCalc = {
  /** Bir poşetin ağırlığı (gram). */
  gram: number;
  /** Hedef adet. */
  target: number;
  /** Net ürün ağırlığı (kg). */
  netKg: number;
  /** Fireler dahil gereken hammadde (kg). */
  rawKg: number;
  /** Tolerans payı (adet). */
  tolerance: number;
};

const num = (p: Record<string, unknown>, k: string) => Number(p[k] ?? 0) || 0;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function bagGram(p: Record<string, unknown>): number {
  const width = num(p, 'width');
  const height = num(p, 'height');
  const gusset = p.type === 'Körüklü' ? num(p, 'gusset') : 0;
  const micron = num(p, 'micron');
  const density = DENSITY[String(p.material)] ?? DENSITY.LDPE!;
  // Tüp film: iki kat. Körüklüde körük genişliğe eklenir.
  return (width + gusset) * height * 2 * (micron / 10000) * density;
}

export function calculatePlastic(p: Record<string, unknown>): PlasticCalc {
  const gram = bagGram(p);
  const amount = num(p, 'amount');
  const target = p.unit === 'kg' ? (gram > 0 ? Math.floor((amount * 1000) / gram) : 0) : Math.floor(amount);
  const netKg = (target * gram) / 1000;
  const yieldRate = (1 - WASTE.extrusion) * (num(p, 'printColours') > 0 ? 1 - WASTE.printing : 1) * (1 - WASTE.cutting);
  const rawKg = yieldRate > 0 ? netKg / yieldRate : 0;
  const tolerance = Math.floor((target * num(p, 'tolerancePct')) / 100);
  return { gram: round(gram, 3), target, netKg: round(netKg, 2), rawKg: round(rawKg, 1), tolerance };
}
