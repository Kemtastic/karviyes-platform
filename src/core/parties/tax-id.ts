// VKN (10 hane) ve TCKN (11 hane) kontrol hanesi doğrulaması.
export function validateTaxId(id: string, legalType: 'company' | 'individual'): boolean {
  if (legalType === 'individual') return validTckn(id);
  return validVkn(id);
}

function validVkn(id: string): boolean {
  if (!/^\d{10}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (Number(id[i]) + (9 - i)) % 10;
    let v = t === 0 ? 0 : (t * 2 ** (9 - i)) % 9;
    if (v === 0 && t !== 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === Number(id[9]);
}

function validTckn(id: string): boolean {
  if (!/^[1-9]\d{10}$/.test(id)) return false;
  const d = id.split('').map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}
