import { AppError } from '@/core/errors';

// TCMB gösterge niteliğindeki kurlar: her iş günü (yaklaşık 15:30) yayımlanan XML.
// Hafta sonu ve tatilde dosya yoktur; o günün işlemi için yayımlanmış son bülten kullanılır.
type Fetcher = (url: string) => Promise<Response>;
type Rate = { buying: string; selling: string; bulletinDate: string };

const MAX_LOOKBACK_DAYS = 10;

export function tcmbUrl(date: string): string {
  const [y, m, d] = date.split('-');
  return `https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`;
}

export function parseTcmbXml(xml: string, currency: string): Rate | null {
  const block = new RegExp(`<Currency[^>]*CurrencyCode="${currency}"[^>]*>([\\s\\S]*?)</Currency>`).exec(xml)?.[1];
  const tag = (name: string) => block && new RegExp(`<${name}>([0-9.]+)</${name}>`).exec(block)?.[1];
  const buying = tag('ForexBuying');
  const selling = tag('ForexSelling');
  const dated = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!buying || !selling || !dated) return null;
  return { buying, selling, bulletinDate: `${dated[3]}-${dated[2]}-${dated[1]}` };
}

function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Verilen gün veya öncesinde yayımlanmış son bültenden döviz satış kuru.
export async function tcmbRate(currency: 'USD' | 'EUR', date: string, fetcher: Fetcher = (u) => fetch(u, { signal: AbortSignal.timeout(8000) })) {
  // Gelecek ve çok eski tarih için TCMB'ye gidilmez (gereksiz dış istek).
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (date < '2000-01-01' || date > tomorrow) throw new AppError('VALIDATION', 'Kur tarihi 2000 ile bugün arasında olmalı.', { fxRateDate: 'Geçerli bir tarih seçin.' });
  let day = date;
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++, day = previousDay(day)) {
    let res: Response;
    try {
      res = await fetcher(tcmbUrl(day));
    } catch {
      break;
    }
    if (res.status === 404) continue;
    if (!res.ok) break;
    const rate = parseTcmbXml(await res.text(), currency);
    if (rate) return { rate: rate.selling, rateDate: rate.bulletinDate, source: 'TCMB döviz satış' };
  }
  throw new AppError('INVALID_STATE', 'TCMB kuru alınamadı. Kuru elle girin.');
}

// Aynı gün ve döviz için TCMB'ye bir saatte bir kez gidilir.
const cache = new Map<string, { at: number; value: Awaited<ReturnType<typeof tcmbRate>> }>();
const CACHE_MS = 60 * 60 * 1000;

export async function cachedTcmbRate(currency: 'USD' | 'EUR', date: string) {
  const key = `${currency}|${date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await tcmbRate(currency, date);
  if (cache.size >= 500) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
