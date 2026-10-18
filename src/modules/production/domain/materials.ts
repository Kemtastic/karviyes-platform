import type { MaterialNeed } from '@/sectors/types';

export type StockRoll = { widthCm: number; colour: string; gsm: number };
export type Demand = MaterialNeed & { ref: string };
export type Shortage = Pick<MaterialNeed, 'kind' | 'label' | 'widthCm' | 'colour' | 'gsm'> & { required: number; available: number; missing: number; refs: string[]; canSlit: boolean };

// Renkler elle yazılır: büyük/küçük harf ve boşluk farkı aynı renk sayılır.
export const colourKey = (v: string) => v.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');

export function rollMatches(need: Pick<MaterialNeed, 'widthCm' | 'colour' | 'gsm'>, roll: StockRoll): boolean {
  return Number(roll.widthCm) === Number(need.widthCm) && colourKey(roll.colour) === colourKey(need.colour) && (need.gsm === null || roll.gsm === need.gsm);
}

// Bekleyen ihtiyaçları malzeme türü, renk, en ve gramaja göre toplar ve boştaki uygun bobinlerle karşılaştırır.
// Her grup boştaki stoğu ayrı ayrı görür (eski sistemle aynı); aynı bobin iki gruba uyabilir.
export function findShortages(demands: Demand[], available: StockRoll[]): Shortage[] {
  const groups = new Map<string, Shortage>();
  for (const d of demands) {
    const id = [d.kind, colourKey(d.colour), d.widthCm, d.gsm ?? '*'].join('|');
    const g = groups.get(id) ?? { kind: d.kind, label: d.label, widthCm: d.widthCm, colour: d.colour.trim(), gsm: d.gsm, required: 0, available: 0, missing: 0, refs: [], canSlit: false };
    g.required += d.rolls;
    if (!g.refs.includes(d.ref)) g.refs.push(d.ref);
    groups.set(id, g);
  }
  const out: Shortage[] = [];
  for (const g of groups.values()) {
    g.available = available.filter((r) => rollMatches(g, r)).length;
    g.missing = Math.max(0, g.required - g.available);
    g.canSlit = g.kind === 'fabric' && available.some((r) => Number(r.widthCm) > g.widthCm && colourKey(r.colour) === colourKey(g.colour) && (g.gsm === null || r.gsm === g.gsm));
    if (g.missing > 0) out.push(g);
  }
  return out;
}
