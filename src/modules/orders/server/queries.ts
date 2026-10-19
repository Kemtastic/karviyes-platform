import { and, asc, desc, eq, gte, inArray, like, lte, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { CURRENCIES, formatMoney, formatUnitPrice, money, moneyToJSON, mulPrice, type Currency } from '@/core/money';
import { companies } from '@/core/db/schema';
import { companyLetterhead, companyProfileSchema } from '@/core/company/profile';
import { invoiceBreakdown } from './api';
import { DEPARTMENT_ROLES, type Role } from '@/core/modules/types';
import { decimalCell } from '@/core/export/csv';
import { normalizeSearch } from '@/core/parties/search';
import { formatDate, istanbulToday } from '@/core/dates';
import { plates } from '@/modules/production/db/schema';
import { getSector } from '@/sectors';
import { LINE_STATUS_LABELS as LINE_TEXT, ORDER_STATUS_LABELS as STATUS_TEXT } from '../ui/status-labels';
import { ORDER_STATUSES, orderLines, orderPayments, orders } from '../db/schema';
import { orderBalance, receivableTotal } from '../domain/totals';

const OFFICE: Role[] = ['admin', 'sales', 'tracking'];

export { ORDER_STATUS_LABELS } from '../ui/status-labels';

type LineRow = typeof orderLines.$inferSelect;

// Siparişlerin satırları, satır sırasıyla.
async function linesOf(ctx: ActionCtx, orderIds: string[]): Promise<Map<string, LineRow[]>> {
  const map = new Map<string, LineRow[]>();
  if (!orderIds.length) return map;
  const rows = await ctx.tx.select().from(orderLines).where(inArray(orderLines.orderId, orderIds)).orderBy(asc(orderLines.lineNo));
  for (const l of rows) map.set(l.orderId, [...(map.get(l.orderId) ?? []), l]);
  return map;
}

// Liste için ürün özeti: ilk iki ürün, fazlası sayıyla.
function productsText(ctx: ActionCtx, lines: LineRow[]): string {
  const sector = getSector(ctx.cfg.sector);
  const texts = lines.map((l) => sector.describe(l.product));
  return texts.length > 2 ? `${texts.slice(0, 2).join(' + ')} +${texts.length - 2} ürün` : texts.join(' + ');
}

// Sipariş adedi: iptal edilen satırlar düşülür (tutarla aynı kural; tamamı iptalse hepsi).
const sumQty = (lines: LineRow[]) => {
  const live = lines.filter((l) => l.status !== 'cancelled');
  return (live.length ? live : lines).reduce((s, l) => s + l.quantity, 0);
};

export const listOrders = defineAction({
  name: 'orders.list',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({
    status: z.enum(ORDER_STATUSES).optional(),
    partyId: z.string().uuid().optional(),
    q: z.string().trim().max(100).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  }),
  run: async (ctx, i) => {
    // Arama: sipariş numarası veya müşteri (adı, yetkili, VKN, il — Türkçe harf duyarsız arama anahtarı).
    const key = i.q ? normalizeSearch(i.q) : '';
    // Harf/rakam kalmayan arama (ör. ".") hiçbir şeyle eşleşmez; boş LIKE her şeyi döndürürdü.
    const noPart = i.q ? i.q.toUpperCase().replace(/[^0-9A-Z-]/g, '') : '';
    const rows = await ctx.tx
      .select({ o: orders, partyName: parties.name })
      .from(orders)
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(
        and(
          i.status ? eq(orders.status, i.status) : undefined,
          i.partyId ? eq(orders.partyId, i.partyId) : undefined,
          i.from ? gte(orders.orderDate, i.from) : undefined,
          i.to ? lte(orders.orderDate, i.to) : undefined,
          i.q ? (noPart || key ? or(noPart ? like(orders.no, `%${noPart}%`) : undefined, key ? like(parties.searchKey, `%${key}%`) : undefined) : sql`false`) : undefined,
        ),
      )
      .orderBy(desc(orders.orderDate), desc(orders.no))
      .limit(500);
    const ids = rows.map((r) => r.o.id);
    const pays = ids.length ? await ctx.tx.select().from(orderPayments).where(inArray(orderPayments.orderId, ids)) : [];
    const lines = await linesOf(ctx, ids);
    return rows.map(({ o, partyName }) => {
      const total = money(o.totalMinor, o.currency as Currency);
      const own = pays.filter((p) => p.orderId === o.id).map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, currency: p.currency as Currency }));
      return {
        id: o.id, no: o.no, orderDate: o.orderDate, deliveryDate: o.deliveryDate, partyName, status: o.status, quantity: sumQty(lines.get(o.id) ?? []),
        product: productsText(ctx, lines.get(o.id) ?? []), total: moneyToJSON(total), balance: moneyToJSON(orderBalance(receivableTotal(o.status, total), own)), version: o.version,
      };
    });
  },
});

export const orderForOffice = defineAction({
  name: 'orders.office',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx.select({ o: orders, party: parties }).from(orders).innerJoin(parties, eq(parties.id, orders.partyId)).where(eq(orders.id, i.id));
    if (!row) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
    const { o, party } = row;
    const pays = await ctx.tx.select().from(orderPayments).where(eq(orderPayments.orderId, o.id)).orderBy(asc(orderPayments.createdAt));
    const [seller] = o.salespersonStaffId ? await ctx.tx.select({ name: staff.name }).from(staff).where(eq(staff.id, o.salespersonStaffId)) : [];
    const total = money(o.totalMinor, o.currency as Currency);
    const balance = orderBalance(receivableTotal(o.status, total), pays.map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, currency: p.currency as Currency })));
    const sector = getSector(ctx.cfg.sector);
    const lines = (await linesOf(ctx, [o.id])).get(o.id) ?? [];
    const plateIds = lines.map((l) => l.plateId).filter((x): x is string => Boolean(x));
    const plateNames = new Map(plateIds.length ? (await ctx.tx.select({ id: plates.id, name: plates.name }).from(plates).where(inArray(plates.id, plateIds))).map((p) => [p.id, p.name]) : []);
    return {
      id: o.id, no: o.no, version: o.version, status: o.status, orderDate: o.orderDate, deliveryDate: o.deliveryDate,
      party: { id: party.id, name: party.name, phone: party.phone, city: party.city },
      salesperson: seller?.name ?? null, salespersonStaffId: o.salespersonStaffId,
      quantity: sumQty(lines), currency: o.currency, fxRate: o.fxRate, fxRateDate: o.fxRateDate, fxSource: o.fxSource,
      total: moneyToJSON(total), balance: moneyToJSON(balance),
      lines: lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, status: l.status, product: l.product, productText: sector.describe(l.product), quantity: l.quantity,
        unitPrice: l.unitPrice, vatRate: l.vatRate, total: moneyToJSON(money(l.totalMinor, o.currency as Currency)),
        packaging: l.packaging, departmentNotes: l.departmentNotes, producedQty: l.producedQty, shippedQty: l.shippedQty, cancelReason: l.cancelReason,
        plateId: l.plateId, plateName: l.plateId ? (plateNames.get(l.plateId) ?? null) : null,
      })),
      invoiceMark: o.invoiceMark, producedQty: o.producedQty, shippedQty: o.shippedQty, cancelReason: o.cancelReason,
      payments: pays.map((p) => ({ id: p.id, kind: p.kind, amount: moneyToJSON(money(p.amountMinor, p.currency as Currency)), paidAt: p.paidAt, note: p.note, correctsPaymentId: p.correctsPaymentId })),
    };
  },
});

// Bölüm ekranları için: fiyat, tutar, ödeme ve bakiye içermez.
export const orderForWorkshop = defineAction({
  name: 'orders.workshop',
  module: 'orders',
  roles: [...OFFICE, ...DEPARTMENT_ROLES],
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx
      .select({ id: orders.id, no: orders.no, orderDate: orders.orderDate, status: orders.status, partyName: parties.name })
      .from(orders)
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(eq(orders.id, i.id));
    if (!row) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
    const lines = (await linesOf(ctx, [row.id])).get(row.id) ?? [];
    return { ...row, lines: lines.map((l) => ({ lineNo: l.lineNo, status: l.status, product: l.product, quantity: l.quantity, packaging: l.packaging, departmentNotes: l.departmentNotes })) };
  },
});

export const listSalesStaff = defineAction({
  name: 'orders.salesStaff',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => (await ctx.tx.select({ id: staff.id, name: staff.name, departments: staff.departments, active: staff.active }).from(staff)).filter((s) => s.active && s.departments.includes('sales')),
});

type AccountTotal = { currency: Currency; total: bigint; paid: bigint };

function accountTotalsJSON(map: Map<Currency, AccountTotal>) {
  return CURRENCIES.filter((c) => map.has(c)).map((c) => {
    const a = map.get(c)!;
    return { currency: c, total: moneyToJSON(money(a.total, c)), paid: moneyToJSON(money(a.paid, c)), balance: moneyToJSON(money(a.total - a.paid, c)) };
  });
}

// Müşterinin sipariş bazlı cari hesabı (fatura bazlı değil): siparişler ve para birimi başına toplamlar.
export const customerAccount = defineAction({
  name: 'orders.customerAccount',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx.select().from(orders).where(eq(orders.partyId, i.partyId)).orderBy(desc(orders.orderDate), desc(orders.no)).limit(10000);
    const ids = rows.map((o) => o.id);
    const pays = ids.length ? await ctx.tx.select().from(orderPayments).where(inArray(orderPayments.orderId, ids)) : [];
    const lines = await linesOf(ctx, ids);
    const totals = new Map<Currency, AccountTotal>();
    const list = rows.map((o) => {
      const currency = o.currency as Currency;
      const total = receivableTotal(o.status, money(o.totalMinor, currency));
      const paid = pays.filter((p) => p.orderId === o.id).reduce((sum, p) => sum + p.amountMinor, 0n);
      const acc = totals.get(currency) ?? { currency, total: 0n, paid: 0n };
      acc.total += total.minor;
      acc.paid += paid;
      totals.set(currency, acc);
      return {
        id: o.id, no: o.no, orderDate: o.orderDate, status: o.status, quantity: sumQty(lines.get(o.id) ?? []),
        total: moneyToJSON(money(o.totalMinor, currency)), paid: moneyToJSON(money(paid, currency)), balance: moneyToJSON(money(total.minor - paid, currency)),
      };
    });
    return { orders: list, totals: accountTotalsJSON(totals) };
  },
});

// Açık alacaklar: bakiyesi sıfırdan büyük müşteriler, para birimi başına (TL önce), büyükten küçüğe.
export const receivables = defineAction({
  name: 'orders.receivables',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({}),
  run: (ctx) => openReceivables(ctx),
});

// Ana sayfa özeti: durum başına sipariş sayısı ve para birimi başına açık sipariş bakiyesi toplamı.
export const ordersSummary = defineAction({
  name: 'orders.summary',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const counts = await ctx.tx.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status);
    const open = await openReceivables(ctx);
    const sums = new Map<Currency, bigint>();
    for (const r of open) sums.set(r.currency, (sums.get(r.currency) ?? 0n) + BigInt(r.balance.minor));
    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<(typeof ORDER_STATUSES)[number], number>>,
      openBalances: CURRENCIES.filter((c) => sums.has(c)).map((c) => moneyToJSON(money(sums.get(c)!, c))),
    };
  },
});

async function openReceivables(ctx: ActionCtx) {
  const totals = await ctx.tx
    .select({ partyId: orders.partyId, currency: orders.currency, total: sql<string>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalMinor} else 0 end), 0)::text`, count: sql<number>`count(*)::int` })
    .from(orders)
    .groupBy(orders.partyId, orders.currency);
  const paid = await ctx.tx
    .select({ partyId: orders.partyId, currency: orderPayments.currency, paid: sql<string>`coalesce(sum(${orderPayments.amountMinor}), 0)::text` })
    .from(orderPayments)
    .innerJoin(orders, eq(orders.id, orderPayments.orderId))
    .groupBy(orders.partyId, orderPayments.currency);
  const paidOf = new Map(paid.map((p) => [`${p.partyId}:${p.currency}`, BigInt(p.paid)]));
  const open = totals
    .map((t) => ({ ...t, balance: BigInt(t.total) - (paidOf.get(`${t.partyId}:${t.currency}`) ?? 0n) }))
    .filter((t) => t.balance > 0n);
  const names = open.length ? await ctx.tx.select({ id: parties.id, name: parties.name, phone: parties.phone }).from(parties).where(inArray(parties.id, [...new Set(open.map((t) => t.partyId))])) : [];
  const nameOf = new Map(names.map((n) => [n.id, n]));
  return open
    .sort((a, b) => CURRENCIES.indexOf(a.currency as Currency) - CURRENCIES.indexOf(b.currency as Currency) || (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0))
    .map((t) => ({ partyId: t.partyId, partyName: nameOf.get(t.partyId)?.name ?? '', phone: nameOf.get(t.partyId)?.phone ?? '', currency: t.currency as Currency, orderCount: t.count, balance: moneyToJSON(money(t.balance, t.currency as Currency)) }));
}

const decimalText = (v: string | null) => (v ? v.replace('.', ',') : '');

// Excel için sipariş listesi: başlıklar sektörün ürün alanlarından gelir. Kişisel veri içerdiği için denetime yazılır.
export const exportOrders = defineAction({
  name: 'orders.export',
  module: 'orders',
  roles: OFFICE,
  input: z.object({ status: z.enum(ORDER_STATUSES).optional() }),
  run: async (ctx, i) => {
    const sector = getSector(ctx.cfg.sector);
    const rows = await ctx.tx
      .select({ o: orders, party: parties, seller: staff.name })
      .from(orders)
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .leftJoin(staff, eq(staff.id, orders.salespersonStaffId))
      .where(i.status ? eq(orders.status, i.status) : undefined)
      .orderBy(desc(orders.orderDate), desc(orders.no))
      .limit(20000);
    const ids = rows.map((r) => r.o.id);
    const pays = ids.length ? await ctx.tx.select({ orderId: orderPayments.orderId, amount: orderPayments.amountMinor }).from(orderPayments).where(inArray(orderPayments.orderId, ids)) : [];
    const paidOf = new Map<string, bigint>();
    for (const p of pays) paidOf.set(p.orderId, (paidOf.get(p.orderId) ?? 0n) + p.amount);
    const lines = await linesOf(ctx, ids);
    const fields = sector.productFields;
    const headers = [
      'Sipariş No', 'Satır', 'Tarih', 'Müşteri', 'Yetkili', 'Telefon', 'Satışçı',
      ...fields.map((f) => (f.unit ? `${f.label} (${f.unit})` : f.label)),
      'Kumaş eni (cm)', 'Adet', 'Üretilen', 'Sevk edilen', 'Birim fiyat', 'KDV %', 'Para birimi', 'Kur', 'Toplam', 'Tahsilat', 'Kalan', 'Satır durumu', 'Durum', 'Fatura No',
    ];
    // Satır başına bir Excel satırı; tahsilat ve kalan siparişe aittir, yalnızca ilk satırda yazılır (toplanınca çift sayılmasın).
    const out = rows.flatMap(({ o, party, seller }) => (lines.get(o.id) ?? []).map((l) => {
      const product = l.product;
      const validated = sector.validateProduct(product);
      const paid = paidOf.get(o.id) ?? 0n;
      const receivable = receivableTotal(o.status, money(o.totalMinor, o.currency as Currency)).minor;
      const first = l.lineNo === 1;
      // İptal edilen satırın tutarı sipariş toplamına girmez (tamamı iptalse sipariş zaten bakiyesizdir).
      const lineTotal = l.status === 'cancelled' && o.status !== 'cancelled' ? 0n : l.totalMinor;
      return [
        o.no, l.lineNo, formatDate(o.orderDate), party.name, party.contactName, party.phone, seller ?? '',
        ...fields.map((f) => {
          const v = product[f.key];
          const custom = sector.formatField?.(f.key, v);
          if (custom !== undefined && custom !== null) return custom;
          if (typeof v === 'boolean') return v ? 'Evet' : '';
          return typeof v === 'number' ? v : v === undefined || v === null ? '' : String(v);
        }),
        sector.materials(validated, l.quantity).find((m) => m.kind === 'fabric')?.widthCm ?? null,
        l.quantity, l.producedQty, l.shippedQty, decimalText(l.unitPrice), decimalText(l.vatRate), o.currency, decimalText(o.fxRate),
        decimalCell(lineTotal), first ? decimalCell(paid) : '', first ? decimalCell(receivable - paid) : '', LINE_TEXT[l.status], STATUS_TEXT[o.status], o.invoiceMark?.no ?? '',
      ];
    }));
    await ctx.audit({ entity: 'order', entityId: ctx.companyId, after: { export: 'orders', rows: out.length, status: i.status ?? 'all' } });
    return { headers, rows: out };
  },
});

// "Eski siparişten kopyala": müşterinin iptal edilmemiş son siparişinin satırları (fiyatlarıyla).
export const lastOrderLines = defineAction({
  name: 'orders.lastLines',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid() }),
  run: async (ctx, i) => {
    const [o] = await ctx.tx
      .select({ id: orders.id, no: orders.no, orderDate: orders.orderDate })
      .from(orders)
      .where(and(eq(orders.partyId, i.partyId), ne(orders.status, 'cancelled')))
      .orderBy(desc(orders.orderDate), desc(orders.no))
      .limit(1);
    if (!o) return null;
    const lines = ((await linesOf(ctx, [o.id])).get(o.id) ?? []).filter((l) => l.status !== 'cancelled');
    return { ...o, lines: lines.map((l) => ({ product: l.product, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate, packaging: l.packaging, departmentNotes: l.departmentNotes, plateId: l.plateId })) };
  },
});

/**
 * Proforma fatura: siparişin iptal edilmemiş satırları KDV hariç, oran bazında KDV ve genel toplam; firmanın anteti ve IBAN'ı.
 * Teklif/ön bilgi belgesidir; fatura yerine geçmez ve muhasebe kaydı oluşturmaz.
 */
export const orderProforma = defineAction({
  name: 'orders.proforma',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ id: z.string().uuid(), validDays: z.number().int().min(1).max(90).default(15), today: z.string().date().optional() }),
  run: async (ctx, i) => {
    const b = await invoiceBreakdown(ctx, i.id);
    const fm = (minor: bigint | string) => formatMoney(money(minor, b.currency));
    const [party] = await ctx.tx.select().from(parties).where(eq(parties.id, b.order.partyId));
    const lines = await ctx.tx.select().from(orderLines).where(and(eq(orderLines.orderId, i.id), ne(orderLines.status, 'cancelled'))).orderBy(asc(orderLines.lineNo));
    const [c] = await ctx.tx.select({ name: companies.name, profile: companies.profile }).from(companies).where(eq(companies.id, ctx.companyId));
    const profile = companyProfileSchema.parse(c?.profile ?? {});
    const sector = getSector(ctx.cfg.sector);
    const today = i.today ?? istanbulToday();
    const until = new Date(`${today}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + i.validDays);
    return {
      no: b.order.no, date: today, validUntil: until.toISOString().slice(0, 10), currency: b.currency,
      companyName: c?.name ?? '', companyInfo: companyLetterhead(profile), bank: profile.bank, iban: profile.iban.replace(/(.{4})(?=.)/g, '$1 '),
      partyName: party?.name ?? '', partyTaxId: party?.taxId ?? '', partyTaxOffice: party?.taxOffice ?? '',
      partyAddress: party ? [party.address, party.district, party.city].filter(Boolean).join(' ') : '',
      lines: lines.map((l) => ({
        lineNo: l.lineNo, productText: sector.describe(l.product as never), quantity: l.quantity,
        unitPrice: formatUnitPrice(l.unitPrice, b.currency), vatRate: String(Number(l.vatRate)), net: fm(mulPrice(l.unitPrice, l.quantity)),
      })),
      rates: b.rates.map((r) => ({ rate: r.rate, base: fm(r.base), vat: fm(r.vat) })),
      base: fm(b.base), vat: fm(b.vat), total: fm(b.base + b.vat),
    };
  },
});
