import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatDate, formatDateTime } from '@/core/dates';

// Türkçe karakterler için gömülü DejaVu Sans (standart PDF yazı tipleri ğ, ş, İ gibi harfleri basamaz).
const FONT_PATH = join(process.cwd(), 'src', 'core', 'pdf', 'fonts', 'DejaVuSans.ttf');
let fontBytes: Promise<Buffer> | undefined;

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

class Writer {
  y = A4[1] - MARGIN;
  constructor(
    private doc: PDFDocument,
    private page: PDFPage,
    private font: PDFFont,
  ) {}

  private ensure(h: number) {
    if (this.y - h < MARGIN) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGIN;
    }
  }

  text(t: string, size = 11, color = rgb(0.1, 0.1, 0.1)) {
    const width = A4[0] - 2 * MARGIN;
    for (const line of wrap(t, this.font, size, width)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font: this.font, color });
      this.y -= size + 4;
    }
  }

  row(label: string, value: string) {
    this.ensure(16);
    this.page.drawText(label, { x: MARGIN, y: this.y - 11, size: 10, font: this.font, color: rgb(0.4, 0.4, 0.4) });
    const lines = wrap(value, this.font, 11, A4[0] - 2 * MARGIN - 150);
    lines.forEach((l, i) => this.page.drawText(l, { x: MARGIN + 150, y: this.y - 11 - i * 15, size: 11, font: this.font }));
    this.y -= Math.max(1, lines.length) * 15 + 3;
  }

  box(title: string, body: string) {
    const lines = wrap(body, this.font, 13, A4[0] - 2 * MARGIN - 20);
    const h = 26 + lines.length * 17;
    this.ensure(h + 8);
    this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: A4[0] - 2 * MARGIN, height: h, color: rgb(1, 0.96, 0.75) });
    this.page.drawText(title, { x: MARGIN + 10, y: this.y - 16, size: 9, font: this.font, color: rgb(0.45, 0.35, 0) });
    lines.forEach((l, i) => this.page.drawText(l, { x: MARGIN + 10, y: this.y - 34 - i * 17, size: 13, font: this.font }));
    this.y -= h + 8;
  }

  gap(h = 10) {
    this.y -= h;
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

async function start(title: string) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  fontBytes ??= readFile(FONT_PATH);
  const font = await doc.embedFont(await fontBytes, { subset: true });
  doc.setTitle(title);
  doc.setLanguage('tr-TR');
  const w = new Writer(doc, doc.addPage(A4), font);
  return { doc, w };
}

const n = (v: number) => v.toLocaleString('tr-TR');

export type JobPdfInput = {
  no: string; company: string; partyName: string; orderDate: string; quantity: number; productText: string; packaging: string; departmentNotes: Record<string, string>;
};

// Atölyede basılı iş emri: fiyat ve ödeme bilgisi içermez.
export async function renderJobPdf(j: JobPdfInput, stageLabels: Record<string, string> = {}): Promise<Uint8Array> {
  const { doc, w } = await start(`İş emri ${j.no}`);
  w.text(j.company, 10, rgb(0.4, 0.4, 0.4));
  w.text(`İş emri · ${j.no}`, 20);
  w.gap();
  w.row('Müşteri', j.partyName);
  w.row('Sipariş tarihi', formatDate(j.orderDate));
  w.row('Ürün', j.productText);
  w.row('Hedef adet', n(j.quantity));
  w.row('Paketleme', j.packaging);
  w.gap();
  for (const [stage, note] of Object.entries(j.departmentNotes)) w.box(`${stageLabels[stage] ?? stage} notu`.toLocaleUpperCase('tr-TR'), note);
  w.gap(16);
  w.text(`Basım: ${formatDateTime(new Date())}`, 8, rgb(0.5, 0.5, 0.5));
  return doc.save();
}

export type OrderPdfInput = JobPdfInput & { salesperson: string | null; unitPrice: string; vatRate: string; total: string; paid: string; balance: string };

export async function renderOrderPdf(o: OrderPdfInput, stageLabels: Record<string, string> = {}): Promise<Uint8Array> {
  const { doc, w } = await start(`Sipariş ${o.no}`);
  w.text(o.company, 10, rgb(0.4, 0.4, 0.4));
  w.text(`Sipariş · ${o.no}`, 20);
  w.gap();
  w.row('Müşteri', o.partyName);
  w.row('Sipariş tarihi', formatDate(o.orderDate));
  if (o.salesperson) w.row('Satış yapan', o.salesperson);
  w.row('Ürün', o.productText);
  w.row('Adet', n(o.quantity));
  w.row('Birim fiyat', Number(o.unitPrice).toLocaleString('tr-TR', { maximumFractionDigits: 4 }));
  w.row('KDV', `%${Number(o.vatRate).toLocaleString('tr-TR')}`);
  w.row('Toplam (KDV dahil)', o.total);
  w.row('Tahsil edilen', o.paid);
  w.row('Kalan', o.balance);
  w.row('Paketleme', o.packaging);
  w.gap();
  for (const [stage, note] of Object.entries(o.departmentNotes)) w.box(`${stageLabels[stage] ?? stage} notu`.toLocaleUpperCase('tr-TR'), note);
  w.gap(16);
  w.text('Bu belge bilgi amaçlıdır; resmî fatura yerine geçmez.', 8, rgb(0.5, 0.5, 0.5));
  return doc.save();
}
