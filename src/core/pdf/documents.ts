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

export type OrderPdfLine = { lineNo: number; productText: string; quantity: number; unitPrice: string; vatRate: string; total: string; packaging: string; departmentNotes: Record<string, string>; cancelled: boolean };
export type OrderPdfInput = { no: string; company: string; partyName: string; orderDate: string; salesperson: string | null; lines: OrderPdfLine[]; total: string; paid: string; balance: string };

export async function renderOrderPdf(o: OrderPdfInput, stageLabels: Record<string, string> = {}): Promise<Uint8Array> {
  const { doc, w } = await start(`Sipariş ${o.no}`);
  w.text(o.company, 10, rgb(0.4, 0.4, 0.4));
  w.text(`Sipariş · ${o.no}`, 20);
  w.gap();
  w.row('Müşteri', o.partyName);
  w.row('Sipariş tarihi', formatDate(o.orderDate));
  if (o.salesperson) w.row('Satış yapan', o.salesperson);
  for (const l of o.lines) {
    w.gap();
    w.text(`${l.lineNo}. ${l.productText}${l.cancelled ? ' — İPTAL' : ''}`, 12);
    w.row('Adet', n(l.quantity));
    w.row('Birim fiyat', Number(l.unitPrice).toLocaleString('tr-TR', { maximumFractionDigits: 4 }));
    w.row('KDV', `%${Number(l.vatRate).toLocaleString('tr-TR')}`);
    w.row('Tutar (KDV dahil)', l.total);
    w.row('Paketleme', l.packaging);
    for (const [stage, note] of Object.entries(l.departmentNotes)) w.box(`${stageLabels[stage] ?? stage} notu`.toLocaleUpperCase('tr-TR'), note);
  }
  w.gap();
  w.row('Toplam (KDV dahil)', o.total);
  w.row('Tahsil edilen', o.paid);
  w.row('Kalan', o.balance);
  w.gap(16);
  w.text('Bu belge bilgi amaçlıdır; resmî fatura yerine geçmez.', 8, rgb(0.5, 0.5, 0.5));
  return doc.save();
}

export type ReconciliationPdfInput = {
  no: string; company: string; partyName: string; taxId: string; asOf: string; balance: string; side: string; contactName: string; message: string;
  rows: { date: string; text: string; debit: string; credit: string; balance: string }[]; truncated: boolean;
  response: { status: string; name: string; title: string; note: string; counterBalance: string | null; at: string } | null;
};

// Cari hesap mutabakat mektubu ve ekstresi.
export async function renderReconciliationPdf(r: ReconciliationPdfInput): Promise<Uint8Array> {
  const { doc, w } = await start(`Mutabakat ${r.no}`);
  w.text(r.company, 10, rgb(0.4, 0.4, 0.4));
  w.text(`Cari hesap mutabakatı · ${r.no}`, 18);
  w.gap();
  w.row('Sayın', `${r.partyName}${r.contactName ? ` · ${r.contactName}` : ''}`);
  if (r.taxId) w.row('Vergi / T.C. no', r.taxId);
  w.row('Mutabakat tarihi', formatDate(r.asOf));
  w.box('BAKİYE', `${r.balance} · ${r.side}`);
  w.text(`Kayıtlarımıza göre ${formatDate(r.asOf)} tarihi itibarıyla cari hesap bakiyeniz yukarıdaki gibidir (KDV dahil). Kendi kayıtlarınızla karşılaştırarak mutabık olup olmadığınızı bildirmenizi rica ederiz. Cevap verilmemesi mutabakat sayılmaz.`, 10);
  w.text('Ekstredeki borç ve alacak sütunları firmamızın kayıtlarına göredir. Bu belge cari hesap mutabakatıdır; Form Ba/Bs bildirimi değildir.', 9, rgb(0.4, 0.4, 0.4));
  if (r.message) {
    w.gap(6);
    w.text(r.message, 10);
  }
  w.gap(12);
  w.text('Ekstre', 13);
  if (r.truncated) w.text('Yalnızca son 500 hareket gösterilmektedir.', 8, rgb(0.5, 0.5, 0.5));
  for (const x of r.rows) w.row(formatDate(x.date), `${x.text} · ${x.debit ? `borç ${x.debit}` : `alacak ${x.credit}`} · bakiye ${x.balance}`);
  if (!r.rows.length) w.text('Bu tarihe kadar hareket yok.', 10);
  if (r.response) {
    w.gap(12);
    w.text('Cevap', 13);
    w.row('Durum', r.response.status);
    w.row('Cevaplayan', `${r.response.name}${r.response.title ? ` · ${r.response.title}` : ''}`);
    w.row('Tarih', formatDateTime(new Date(r.response.at)));
    if (r.response.counterBalance) w.row('Karşı tarafın bakiyesi', r.response.counterBalance);
    if (r.response.note) w.row('Not', r.response.note);
  }
  w.gap(16);
  w.text('Bu belge bilgi amaçlıdır; yasal defter kayıtları esastır.', 8, rgb(0.5, 0.5, 0.5));
  return doc.save();
}
