import { describe, expect, it } from 'vitest';
import { parseTcmbXml, tcmbRate, tcmbUrl } from '@/core/fx/tcmb';

const xml = (date: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="${date}" Date="x" Bulten_No="2026/200">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit><Isim>ABD DOLARI</Isim><CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1234</ForexBuying><ForexSelling>41.2345</ForexSelling>
  </Currency>
  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit><ForexBuying>47.5000</ForexBuying><ForexSelling>47.5856</ForexSelling>
  </Currency>
</Tarih_Date>`;

describe('TCMB kuru', () => {
  it('XML içinden döviz alış ve satış', () => {
    expect(parseTcmbXml(xml('16.10.2026'), 'USD')).toEqual({ buying: '41.1234', selling: '41.2345', bulletinDate: '2026-10-16' });
    expect(parseTcmbXml(xml('16.10.2026'), 'EUR')).toMatchObject({ selling: '47.5856' });
  });

  it('tarihli adres biçimi', () => {
    expect(tcmbUrl('2026-10-05')).toBe('https://www.tcmb.gov.tr/kurlar/202610/05102026.xml');
  });

  it('hafta sonu/tatilde yayımlanmış son güne gider', async () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      if (url.endsWith('16102026.xml')) return new Response(xml('16.10.2026'), { status: 200 });
      return new Response('yok', { status: 404 });
    };
    const r = await tcmbRate('USD', '2026-10-18', fetcher);
    expect(r).toEqual({ rate: '41.2345', rateDate: '2026-10-16', source: 'TCMB döviz satış' });
    expect(asked.map((u) => u.slice(-12))).toEqual(['18102026.xml', '17102026.xml', '16102026.xml']);
  });

  it('bulunamazsa anlaşılır hata', async () => {
    await expect(tcmbRate('USD', '2026-10-18', async () => new Response('', { status: 500 }))).rejects.toThrow(/TCMB kuru alınamadı/);
  });
});
