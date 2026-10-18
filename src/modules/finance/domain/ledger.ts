// Cari hesap hesapları (saf fonksiyonlar). Tutarlar kuruş bigint; işaret firmanın gözünden:
// artı = cari bize borçlu (alacağımız), eksi = biz cariye borçluyuz.

export type LedgerEntry = {
  id: string;
  date: string;
  /** Vade (fatura); yoksa null. */
  due: string | null;
  kind: 'opening' | 'sales' | 'purchase' | 'sales_return' | 'purchase_return' | 'in' | 'out';
  /** Artı tutar (açılışta işaretli); yön `kind`'dan gelir. */
  amount: bigint;
  text: string;
};

/** Hareketin bakiyeye etkisi: satış faturası ve bizim yaptığımız ödeme cariyi borçlandırır. */
export function signed(e: LedgerEntry): bigint {
  switch (e.kind) {
    case 'opening':
      return e.amount;
    case 'sales':
    case 'purchase_return':
    case 'out':
      return e.amount;
    case 'purchase':
    case 'sales_return':
    case 'in':
      return -e.amount;
  }
}

const ORDER: Record<LedgerEntry['kind'], number> = { opening: 0, sales: 1, purchase: 1, sales_return: 1, purchase_return: 1, in: 2, out: 2 };

export function sortEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind] || a.id.localeCompare(b.id));
}

export type StatementRow = LedgerEntry & { debit: bigint; credit: bigint; balance: bigint };

/** Cari ekstresi: tarih sırasıyla borç, alacak ve yürüyen bakiye. `from` verilirse öncesi devir satırında toplanır. */
export function statement(entries: LedgerEntry[], from?: string): { carried: bigint; rows: StatementRow[]; balance: bigint } {
  let balance = 0n;
  let carried = 0n;
  const rows: StatementRow[] = [];
  for (const e of sortEntries(entries)) {
    const s = signed(e);
    balance += s;
    if (from && e.date < from) {
      carried = balance;
      continue;
    }
    rows.push({ ...e, debit: s > 0n ? s : 0n, credit: s < 0n ? -s : 0n, balance });
  }
  return { carried, rows, balance };
}

export const AGING_BUCKETS = ['unplanned', 'current', 'd1_30', 'd31_60', 'd61_90', 'd91_120', 'd120p'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export type OpenItem = { id: string; date: string; due: string | null; total: bigint; open: bigint; daysOverdue: number; bucket: AgingBucket; text: string };

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function bucketOf(due: string | null, today: string): { bucket: AgingBucket; daysOverdue: number } {
  if (!due) return { bucket: 'unplanned', daysOverdue: 0 };
  const d = days(due, today);
  if (d <= 0) return { bucket: 'current', daysOverdue: 0 };
  if (d <= 30) return { bucket: 'd1_30', daysOverdue: d };
  if (d <= 60) return { bucket: 'd31_60', daysOverdue: d };
  if (d <= 90) return { bucket: 'd61_90', daysOverdue: d };
  if (d <= 120) return { bucket: 'd91_120', daysOverdue: d };
  return { bucket: 'd120p', daysOverdue: d };
}

/**
 * Açık kalemler (FIFO): borçlandıran kalemler (açılış alacağı, satış faturası, cariye ödeme/iade) vade sırasıyla
 * (vadesiz en sona) alacaklandıran toplamla kapatılır. `side` 'payable' verilirse hesap ters yönden yapılır.
 */
/** allocated: belirli kalemlere eşleştirilmiş tutarlar (kalem id → tutar); bunlar FIFO'dan önce düşülür. */
export function openItems(entries: LedgerEntry[], today: string, side: 'receivable' | 'payable' = 'receivable', allocated: Map<string, bigint> = new Map()): OpenItem[] {
  const sign = side === 'receivable' ? 1n : -1n;
  // Tutar her zaman bu tarafın yönündeki büyüklüktür (açılış eksi girilmiş olabilir).
  const debits: { e: LedgerEntry; amt: bigint }[] = [];
  let pool = 0n;
  for (const e of entries) {
    const s = signed(e) * sign;
    if (s > 0n) debits.push({ e, amt: s });
    else pool += -s;
  }
  // Açılış kaleminin vadesi açılış tarihidir (en eski borç önce kapanır); vadesiz faturalar en sona.
  const dueOf = (e: LedgerEntry) => e.due ?? (e.kind === 'opening' ? e.date : null);
  debits.sort((a, b) => (dueOf(a.e) ?? '9999-12-31').localeCompare(dueOf(b.e) ?? '9999-12-31') || a.e.date.localeCompare(b.e.date) || a.e.id.localeCompare(b.e.id));
  // Önce eşleştirilmiş tutarlar (havuzdan düşülerek), sonra kalan havuz vade sırasıyla.
  const remaining = new Map<string, bigint>();
  for (const { e: d, amt } of debits) {
    const want = allocated.get(d.id) ?? 0n;
    const used = [want, amt, pool].reduce((m, v) => (v < m ? v : m));
    pool -= used > 0n ? used : 0n;
    remaining.set(d.id, amt - (used > 0n ? used : 0n));
  }
  const out: OpenItem[] = [];
  for (const { e: d, amt: total } of debits) {
    const amt = remaining.get(d.id)!;
    const used = pool < amt ? pool : amt;
    pool -= used;
    const open = amt - used;
    if (open <= 0n) continue;
    const due = dueOf(d);
    out.push({ id: d.id, date: d.date, due, total, open, text: d.text, ...bucketOf(due, today) });
  }
  return out;
}

export type Aging = Record<AgingBucket, bigint> & { total: bigint; overdue: bigint; weightedDays: number };

export function aging(items: OpenItem[]): Aging {
  const a = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0n])) as Record<AgingBucket, bigint>;
  let total = 0n;
  let overdue = 0n;
  let weighted = 0n;
  for (const i of items) {
    a[i.bucket] += i.open;
    total += i.open;
    if (i.daysOverdue > 0) {
      overdue += i.open;
      weighted += i.open * BigInt(i.daysOverdue);
    }
  }
  return { ...a, total, overdue, weightedDays: overdue > 0n ? Number(weighted / overdue) : 0 };
}

/** Fatura toplamı: KDV matrah üzerinden kuruşa yuvarlanır (yarım kuruş yukarı), tevkifat KDV'den düşülür. */
export function invoiceTotals(baseMinor: bigint, vatRatePercent: number, withholdingTenths = 0): { vat: bigint; withholding: bigint; total: bigint } {
  const vat = (baseMinor * BigInt(Math.round(vatRatePercent * 100)) + 5000n) / 10000n;
  const withholding = (vat * BigInt(withholdingTenths) + 5n) / 10n;
  return { vat, withholding, total: baseMinor + vat - withholding };
}

export const INVOICE_KIND_LABELS: Record<string, string> = { sales: 'Satış faturası', purchase: 'Alış faturası', sales_return: 'Satış iade faturası', purchase_return: 'Alış iade faturası' };
