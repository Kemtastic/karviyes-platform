import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { formatDate } from '@/core/dates';
import { parties } from '@/core/db/schema';
import { decimalCell } from '@/core/export/csv';
import { mulPrice } from '@/core/money';
import { finInvoices } from '../db/schema';
import { INVOICE_KIND_LABELS } from '../domain/ledger';
import { FIN } from './actions';
import { accountStatement, invoicesList, movementsList, partyBalances, partyLedger } from './queries';

const month = z.string().regex(/^\d{4}-\d{2}$/);

function monthRange(m: string): { from: string; to: string } {
  const from = `${m}-01`;
  const end = new Date(`${from}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { from, to: end.toISOString().slice(0, 10) };
}

/** Varsayılan Ba-Bs eşiği (KDV hariç, TL). Güncel eşik GİB'den doğrulanmalı; kullanıcı ekranda değiştirebilir. */
export const BABS_DEFAULT_THRESHOLD_TL = 5000;

/**
 * Ba-Bs hazırlık listesi: ay içinde aynı kişi/kurumla KDV hariç toplamı eşiği aşan alışlar (Ba) ve satışlar (Bs), belge sayısıyla.
 * Yalnız TL faturalar; dövizli faturalar ayrıca listelenir (TL karşılığı mali müşavirce eklenir). İade faturaları dahil edilmez.
 */
export const babsReport = defineAction({
  name: 'finance.babs',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ month, thresholdTl: z.coerce.number().min(0).max(1_000_000).default(BABS_DEFAULT_THRESHOLD_TL) }),
  run: async (ctx, i) => {
    const { from, to } = monthRange(i.month);
    const rows = await ctx.tx
      .select({ kind: finInvoices.kind, partyId: finInvoices.partyId, currency: finInvoices.currency, base: finInvoices.baseMinor, fxRate: finInvoices.fxRate, name: parties.name, taxId: parties.taxId, taxOffice: parties.taxOffice })
      .from(finInvoices)
      .innerJoin(parties, eq(parties.id, finInvoices.partyId))
      .where(and(eq(finInvoices.status, 'recorded'), inArray(finInvoices.kind, ['sales', 'purchase']), gte(finInvoices.date, from), lte(finInvoices.date, to)));
    const threshold = BigInt(Math.round(i.thresholdTl * 100));
    type G = { form: 'Ba' | 'Bs'; partyId: string; name: string; taxId: string; taxOffice: string; count: number; base: bigint };
    const groups = new Map<string, G>();
    const foreign: { form: 'Ba' | 'Bs'; name: string; taxId: string; currency: string; count: number }[] = [];
    for (const r of rows) {
      const form = r.kind === 'purchase' ? 'Ba' : 'Bs';
      // Dövizli fatura kuruyla TL'ye çevrilir; kuru olmayan eski kayıt ayrı listelenir.
      let base = r.base;
      if (r.currency !== 'TRY' && r.fxRate) base = (mulPrice(r.fxRate.replace(/(\.\d{4})\d+$/, '$1'), r.base) + 50n) / 100n;
      if (r.currency !== 'TRY' && !r.fxRate) {
        const f = foreign.find((x) => x.form === form && x.taxId === r.taxId && x.currency === r.currency && x.name === r.name);
        if (f) f.count += 1;
        else foreign.push({ form, name: r.name, taxId: r.taxId, currency: r.currency, count: 1 });
        continue;
      }
      const key = `${form}|${r.partyId}`;
      const g = groups.get(key) ?? { form, partyId: r.partyId, name: r.name, taxId: r.taxId, taxOffice: r.taxOffice, count: 0, base: 0n };
      g.count += 1;
      g.base += base;
      groups.set(key, g);
    }
    const list = [...groups.values()]
      .filter((g) => g.base >= threshold)
      .sort((a, b) => a.form.localeCompare(b.form) || Number(b.base - a.base))
      .map((g) => ({ ...g, base: g.base.toString(), missingTaxId: !g.taxId }));
    return { month: i.month, from, to, thresholdTl: i.thresholdTl, rows: list, foreign };
  },
});

type Csv = { headers: string[]; rows: (string | number | null)[][]; name: string };

const money = (v: string) => decimalCell(BigInt(v));

/** Muhasebe dışa aktarımları (Excel'de açılan CSV). */
export async function financeCsv(kind: string, params: URLSearchParams): Promise<{ ok: true; data: Csv } | { ok: false; code: string; message: string }> {
  const from = params.get('bas') ?? undefined;
  const to = params.get('bit') ?? undefined;
  const date = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  switch (kind) {
    case 'faturalar': {
      const r = await invoicesList({ from: date(from), to: date(to) });
      if (!r.ok) return r;
      return {
        ok: true,
        data: {
          name: 'fatura-kayitlari',
          headers: ['Tarih', 'Tür', 'Fatura no', 'Cari', 'Vade', 'Para birimi', 'Matrah', 'KDV', 'Tevkifat', 'Toplam', 'Durum', 'Not'],
          rows: r.data.map((f) => [formatDate(f.date), INVOICE_KIND_LABELS[f.kind] ?? f.kind, f.docNo, f.partyName, f.due ? formatDate(f.due) : '', f.currency, money(f.base), money(f.vat), money(f.withholding), money(f.total), f.status === 'cancelled' ? 'İptal' : 'Kayıtlı', f.note]),
        },
      };
    }
    case 'hareketler': {
      const r = await movementsList({ from: date(from), to: date(to) });
      if (!r.ok) return r;
      const LABEL: Record<string, string> = { collection: 'Tahsilat', payment: 'Ödeme', expense: 'Masraf', income: 'Diğer gelir', transfer: 'Virman', check: 'Çek' };
      return {
        ok: true,
        data: {
          name: 'tahsilat-odemeler',
          headers: ['Tarih', 'Tür', 'Yön', 'Cari', 'Hesap', 'Kategori', 'Para birimi', 'Tutar', 'KDV', 'Açıklama', 'Durum'],
          rows: r.data.map((m) => [formatDate(m.date), LABEL[m.kind] ?? m.kind, m.direction === 'in' ? 'Giriş' : 'Çıkış', m.partyName ?? '', m.accountName ?? '', m.category, m.currency, money(m.amount), money(m.vat), m.note, m.reversed ? 'İptal' : '']),
        },
      };
    }
    case 'bakiyeler': {
      const r = await partyBalances({});
      if (!r.ok) return r;
      return {
        ok: true,
        data: {
          name: 'cari-bakiyeler',
          headers: ['Cari', 'Para birimi', 'Bakiye (+ alacağımız)', 'Açık alacak', 'Vadesi geçmiş alacak', 'Açık borç', 'Vadesi geçmiş borç', 'Son hareket'],
          rows: r.data.map((b) => [b.partyName, b.currency, money(b.balance), money(String(b.receivable.total)), money(String(b.receivable.overdue)), money(String(b.payable.total)), money(String(b.payable.overdue)), b.lastDate ? formatDate(b.lastDate) : '']),
        },
      };
    }
    case 'ekstre': {
      const partyId = params.get('cari') ?? '';
      const r = await partyLedger({ partyId, from: date(from) });
      if (!r.ok) return r;
      const out: (string | null)[][] = [];
      for (const c of r.data.currencies) {
        if (c.carried !== '0') out.push(['', 'Devir', c.currency, '', '', money(c.carried)]);
        for (const x of c.rows) out.push([formatDate(x.date), x.text, c.currency, x.debit !== '0' ? money(x.debit) : '', x.credit !== '0' ? money(x.credit) : '', money(x.balance)]);
      }
      return { ok: true, data: { name: 'cari-ekstre', headers: ['Tarih', 'Açıklama', 'Para birimi', 'Borç', 'Alacak', 'Bakiye'], rows: out } };
    }
    case 'hesap': {
      const r = await accountStatement({ id: params.get('hesap') ?? '', from: date(from) });
      if (!r.ok) return r;
      if (!r.data) return { ok: false, code: 'NOT_FOUND', message: 'Hesap bulunamadı.' };
      return {
        ok: true,
        data: {
          name: 'hesap-ekstresi',
          headers: ['Tarih', 'Açıklama', 'Giriş', 'Çıkış', 'Bakiye', 'Durum'],
          rows: [...r.data.rows].reverse().map((m) => [formatDate(m.date), [m.partyName ?? m.category, m.note].filter(Boolean).join(' · '), m.direction === 'in' ? money(m.amount) : '', m.direction === 'out' ? money(m.amount) : '', money(m.balance), m.reversed ? 'İptal' : '']),
        },
      };
    }
    case 'ba-bs': {
      const r = await babsReport({ month: params.get('ay') ?? '', thresholdTl: params.get('esik') ?? undefined });
      if (!r.ok) return r;
      return {
        ok: true,
        data: {
          name: `ba-bs-${r.data.month}`,
          headers: ['Form', 'Unvan', 'VKN/TCKN', 'Vergi dairesi', 'Belge sayısı', 'KDV hariç tutar (TL)'],
          rows: r.data.rows.map((g) => [g.form, g.name, g.taxId, g.taxOffice, g.count, money(g.base)]),
        },
      };
    }
    default:
      return { ok: false, code: 'NOT_FOUND', message: 'Bilinmeyen dışa aktarım.' };
  }
}
