import { AppError } from './errors';

// Para yalnızca bu modülde hesaplanır: en küçük birim (kuruş/cent) bigint, yarım birim sıfırdan uzağa yuvarlanır.
export const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Money = { minor: bigint; currency: Currency };

const SYMBOL: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€' };
const SCALE = 10000n; // birim fiyat ve oran ondalığı: 4 hane

export function money(minor: bigint | number | string, currency: Currency): Money {
  return { minor: BigInt(minor), currency };
}

function divRound(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice >= (d < 0n ? -d : d)) return (n < 0n) !== (d < 0n) ? q - 1n : q + 1n;
  return q;
}

// "8.7500" veya "18,5" gibi en çok 4 ondalıklı sayıyı 10^4 ölçekli tamsayıya çevirir.
function toScaled(value: string | number): bigint {
  const text = String(value).trim().replace(',', '.');
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!m) throw new AppError('VALIDATION', `Geçersiz sayı: ${value}`);
  const [, sign, int, frac = ''] = m;
  const scaled = BigInt(int!) * SCALE + BigInt(frac.padEnd(4, '0'));
  return sign ? -scaled : scaled;
}

export function mulPrice(unitPrice: string, quantity: bigint | number): bigint {
  // birim fiyat (×10^4) × miktar → kuruş: 10^4 / 100 = 100'e bölünür
  return divRound(toScaled(unitPrice) * BigInt(quantity), SCALE / 100n);
}

export function applyRate(minor: bigint, ratePercent: number | string): bigint {
  return divRound(minor * toScaled(ratePercent), SCALE * 100n);
}

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new AppError('CURRENCY_MISMATCH', 'Farklı para birimindeki tutarlar birlikte hesaplanamaz.');
}

export function addMoney(a: Money, b: Money): Money {
  assertSame(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSame(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

const intFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

export function formatMoney(m: Money): string {
  const negative = m.minor < 0n;
  const abs = negative ? -m.minor : m.minor;
  const whole = intFormat.format(abs / 100n);
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '−' : ''}${whole},${cents} ${SYMBOL[m.currency]}`;
}

/** Birim fiyat (4 haneye kadar ondalık) Türkçe biçimde: "8.7500" → "8,75 ₺", "8.7525" → "8,7525 ₺". */
export function formatUnitPrice(price: string, currency: Currency): string {
  const negative = price.trim().startsWith('-');
  const [int = '0', frac = ''] = price.trim().replace(/^-/, '').split('.');
  const shown = frac.replace(/0+$/, '').padEnd(2, '0');
  return `${negative ? '−' : ''}${intFormat.format(BigInt(int || '0'))},${shown} ${SYMBOL[currency]}`;
}

// Kabul: "1.234,56", "1234,56", "1234.56", "1.234". Ondalık en çok 2 hane.
export function parseMoney(input: string, currency: Currency): Money {
  let text = input.trim().replace(/\s/g, '');
  const negative = text.startsWith('-') || text.startsWith('−');
  if (negative) text = text.slice(1);
  let int: string;
  let frac = '';
  if (text.includes(',')) {
    const [left = '', right = '', extra] = text.split(',');
    if (extra !== undefined || !/^\d{1,3}(\.\d{3})*$|^\d+$/.test(left) || !/^\d{1,2}$/.test(right)) throw invalid(input);
    int = left.replace(/\./g, '');
    frac = right;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    int = text.replace(/\./g, '');
  } else {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!m) throw invalid(input);
    int = m[1]!;
    frac = m[2] ?? '';
  }
  const minor = BigInt(int) * 100n + BigInt(frac.padEnd(2, '0'));
  return { minor: negative ? -minor : minor, currency };
}

function invalid(input: string): AppError {
  return new AppError('VALIDATION', `Tutar anlaşılamadı: "${input}". Örnek: 1.234,56`);
}

export function moneyToJSON(m: Money): { minor: string; currency: Currency } {
  return { minor: m.minor.toString(), currency: m.currency };
}

export function moneyFromJSON(j: { minor: string; currency: Currency }): Money {
  return { minor: BigInt(j.minor), currency: j.currency };
}
