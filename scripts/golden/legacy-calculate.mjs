// Eski Karviyes (v78) calculate() fonksiyonunu kendi kaynağından çalıştırıp altın değerleri üretir.
// Kullanım: node scripts/golden/legacy-calculate.mjs <eski-proje>/lib/production.ts tests/fixtures/bags-calculate-golden.json
import { readFileSync, writeFileSync } from 'node:fs';

const [source, out] = process.argv.slice(2);
const text = readFileSync(source, 'utf8');
const start = text.indexOf('export function calculate(');
const end = text.indexOf('\nexport const shapes', start);
const body = text.slice(start, end).replace('export function calculate(', 'function calculate(').replace('}:any)', '})');
const calculate = new Function(`${body}; return calculate;`)();

const shapes = ['Körüksüz', 'Alt Körüklü', '3D', 'Üçgen Kesim'];
const cases = [];
let i = 0;
for (const width of [20, 35, 48, 60]) {
  for (const height of [25, 42, 70]) {
    const shape = shapes[i % shapes.length];
    const gusset = shape === 'Körüksüz' ? 0 : [8, 14, 11][i % 3];
    const biye = i % 2 ? 5 : 0;
    const biyeType = i % 5 === 0 ? 'without' : 'with';
    const rolls = [1, 3, 6][i % 3];
    const rollMetres = i % 4 === 0 ? 1200 : 1000;
    cases.push({ input: { width, height, gusset, biye, biyeType, shape, rolls, rollMetres }, expected: calculate({ width, height, gusset, biye, biyeType, shape, rolls, rollMetres }) });
    i++;
  }
}
for (const shape of shapes) {
  for (const width of [33, 57]) {
    const input = { width, height: 40, gusset: shape === 'Körüksüz' ? 0 : 13, biye: 5, biyeType: 'with', shape, rolls: 2, rollMetres: 1000 };
    cases.push({ input, expected: calculate(input) });
  }
}
for (const extra of [{ width: 41, height: 50, gusset: 12, biye: 4, biyeType: 'with', shape: '3D', rolls: 4 }, { width: 22, height: 30, gusset: 0, biye: 0, biyeType: 'without', shape: 'Körüksüz', rolls: 1 }, { width: 0, height: 40, gusset: 0, biye: 0, biyeType: 'with', shape: 'Körüksüz', rolls: 2 }, { width: 59, height: 69, gusset: 16, biye: 6, biyeType: 'with', shape: 'Alt Körüklü', rolls: 5, rollMetres: 900 }]) {
  cases.push({ input: extra, expected: calculate(extra) });
}
writeFileSync(out, JSON.stringify(cases, null, 1) + '\n');
console.log(`${cases.length} örnek yazıldı`);
