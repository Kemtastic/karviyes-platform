import { describe, expect, it } from 'vitest';
import { renderJobPdf, renderOrderPdf, renderProformaPdf, renderShipmentSlipPdf } from '@/core/pdf/documents';

async function textOf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    out += content.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n';
  }
  return out;
}

const job = {
  no: 'S-2026-000001', company: 'Karviyes Ambalaj', partyName: 'Şirin Ğıda Üretim Çanta İç Dış Öğe', orderDate: '2026-10-18', quantity: 6666,
  productText: '45×45 cm · Körüksüz · El Geçme · 70 gr · Beyaz · baskı: siyah', packaging: 'Çuval · 4 × 2000',
  departmentNotes: { printing: 'Logo ortalı, ğüşiöçİ' },
};

describe('PDF çıktıları', () => {
  it('iş emri Türkçe karakterleri bozmadan basar ve fiyat içermez', async () => {
    const text = await textOf(await renderJobPdf(job));
    expect(text).toContain('Şirin Ğıda Üretim Çanta İç Dış Öğe');
    expect(text).toContain('ğüşiöçİ');
    expect(text).toContain('6.666');
    expect(text).not.toMatch(/₺|Birim fiyat|Toplam/);
  });

  it('sipariş PDF i her ürün satırını ve tutarları Türkçe biçimde gösterir; iptal satırı işaretlenir', async () => {
    const line = { quantity: 6666, unitPrice: '8.7500', vatRate: '10.00', packaging: 'Çuval · 4 × 2000', departmentNotes: { printing: 'Logo ortalı' }, cancelled: false };
    const text = await textOf(await renderOrderPdf({
      no: job.no, company: job.company, partyName: job.partyName, orderDate: job.orderDate, salesperson: 'Ayşe',
      lines: [
        { ...line, lineNo: 1, productText: '45×45 cm · Körüksüz', total: '64.160,25 ₺' },
        { ...line, lineNo: 2, productText: '30×40 cm · Kulplu', total: '1.000,00 ₺', cancelled: true, departmentNotes: {} },
      ],
      total: '64.160,25 ₺', paid: '1.500,00 ₺', balance: '62.660,25 ₺',
    }));
    expect(text).toContain('45×45 cm · Körüksüz');
    expect(text).toContain('30×40 cm · Kulplu');
    expect(text).toContain('İPTAL');
    expect(text).toContain('64.160,25');
    expect(text).toContain('Kalan');
  });

  it('sevk fişi alıcıyı, miktarı, kalanı ve imza alanlarını basar; fiyat içermez', async () => {
    const text = await textOf(await renderShipmentSlipPdf({
      companyName: 'Karviyes Ambalaj', companyInfo: 'Karviyes Ambalaj A.Ş. · Kozyatağı V.D. 1234567890', jobNo: 'S-2026-000001/1', orderNo: 'S-2026-000001',
      shippedAt: '2026-10-19', qty: 2000, note: 'Kamyon 34 AB 123', product: job.productText, packaging: job.packaging, orderedQty: 6666, shippedTotal: 4000,
      partyName: job.partyName, partyTaxId: '9876543210', partyTaxOffice: 'Ümraniye', partyAddress: 'Atatürk Cd. No:1 Ümraniye İstanbul',
    }));
    expect(text).toContain('Şirin Ğıda');
    expect(text).toContain('2.000 adet');
    expect(text).toContain('kalan 2.666');
    expect(text).toContain('Teslim alan');
    expect(text).toContain('yerine geçmez');
    expect(text).not.toMatch(/₺|Birim fiyat/);
  });

  it('proforma satırları, oran bazında KDV, genel toplamı ve IBANı basar; fatura olmadığını yazar', async () => {
    const text = await textOf(await renderProformaPdf({
      no: 'S-2026-000001', date: '2026-10-20', validUntil: '2026-11-04', companyName: 'Karviyes Ambalaj', companyInfo: 'Karviyes Ambalaj A.Ş.', bank: 'Ziraat', iban: 'TR33 0006 1005 1978 6457 8413 26',
      partyName: job.partyName, partyTaxId: '', partyTaxOffice: '', partyAddress: '',
      lines: [{ lineNo: 1, productText: job.productText, quantity: 1000, unitPrice: '10,00 ₺', vatRate: '10', net: '10.000,00 ₺' }],
      rates: [{ rate: '10', base: '10.000,00 ₺', vat: '1.000,00 ₺' }], base: '10.000,00 ₺', vat: '1.000,00 ₺', total: '11.000,00 ₺',
    }));
    expect(text).toContain('Proforma fatura');
    expect(text).toContain('11.000,00');
    expect(text).toContain('KDV %10');
    expect(text).toContain('TR33 0006');
    expect(text).toContain('04.11.2026');
    expect(text).toContain('Fatura yerine geçmez');
  });
});
