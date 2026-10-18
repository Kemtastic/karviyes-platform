import { describe, expect, it } from 'vitest';
import { aging, bucketOf, invoiceTotals, openItems, statement, type LedgerEntry } from '@/modules/finance/domain/ledger';

const e = (id: string, kind: LedgerEntry['kind'], amount: bigint, date: string, due: string | null = null): LedgerEntry => ({ id, kind, amount, date, due, text: id });

describe('fatura toplamı', () => {
  it('KDV kuruşa yuvarlanır, tevkifat KDV üzerinden düşülür', () => {
    expect(invoiceTotals(10000n, 20)).toEqual({ vat: 2000n, withholding: 0n, total: 12000n });
    // 0,05 TL matrahın %10'u 0,005 → 0,01
    expect(invoiceTotals(5n, 10).vat).toBe(1n);
    // 5/10 tevkifat: 1.000,00 + 200,00 KDV − 100,00
    expect(invoiceTotals(100000n, 20, 5)).toEqual({ vat: 20000n, withholding: 10000n, total: 110000n });
    expect(invoiceTotals(100000n, 0)).toEqual({ vat: 0n, withholding: 0n, total: 100000n });
  });
});

describe('ekstre', () => {
  const entries = [
    e('f1', 'sales', 120000n, '2026-09-01', '2026-09-30'),
    e('t1', 'in', 50000n, '2026-09-10'),
    e('a0', 'opening', 10000n, '2026-01-01'),
    e('p1', 'purchase', 3000n, '2026-10-01'),
    e('o1', 'out', 1000n, '2026-10-02'),
  ];

  it('tarih sırasıyla borç, alacak ve yürüyen bakiye', () => {
    const s = statement(entries);
    expect(s.rows.map((r) => [r.id, r.debit, r.credit, r.balance])).toEqual([
      ['a0', 10000n, 0n, 10000n],
      ['f1', 120000n, 0n, 130000n],
      ['t1', 0n, 50000n, 80000n],
      ['p1', 0n, 3000n, 77000n],
      ['o1', 1000n, 0n, 78000n],
    ]);
    expect(s.balance).toBe(78000n);
  });

  it('başlangıç tarihinden öncesi devir olur', () => {
    const s = statement(entries, '2026-09-15');
    expect(s.carried).toBe(80000n);
    expect(s.rows.map((r) => r.id)).toEqual(['p1', 'o1']);
    expect(s.balance).toBe(78000n);
  });
});

describe('açık kalemler ve yaşlandırma', () => {
  it('tahsilat önce vadesi en erken faturayı kapatır, vadesiz en son', () => {
    const items = openItems(
      [
        e('vadesiz', 'sales', 1000n, '2026-08-01'),
        e('gec', 'sales', 3000n, '2026-08-05', '2026-10-30'),
        e('erken', 'sales', 2000n, '2026-08-10', '2026-09-01'),
        e('t', 'in', 2500n, '2026-09-05'),
      ],
      '2026-10-18',
    );
    expect(items.map((i) => [i.id, i.open, i.bucket])).toEqual([
      ['gec', 2500n, 'current'],
      ['vadesiz', 1000n, 'unplanned'],
    ]);
  });

  it('kova sınırları', () => {
    expect(bucketOf('2026-10-18', '2026-10-18').bucket).toBe('current');
    expect(bucketOf('2026-10-17', '2026-10-18')).toEqual({ bucket: 'd1_30', daysOverdue: 1 });
    expect(bucketOf('2026-09-18', '2026-10-18').bucket).toBe('d1_30');
    expect(bucketOf('2026-09-17', '2026-10-18').bucket).toBe('d31_60');
    expect(bucketOf('2026-06-01', '2026-10-18').bucket).toBe('d120p');
  });

  it('açılış alacağı vadesi açılış tarihidir; toplamlar ve ağırlıklı gün', () => {
    const items = openItems([e('a', 'opening', 1000n, '2026-10-08'), e('f', 'sales', 3000n, '2026-10-01', '2026-10-15')], '2026-10-18');
    const a = aging(items);
    expect(a.total).toBe(4000n);
    expect(a.overdue).toBe(4000n);
    expect(a.d1_30).toBe(4000n);
    // (1000×10 + 3000×3) / 4000 = 4,75 → 4
    expect(a.weightedDays).toBe(4);
  });

  it('borç tarafı: alış faturası ve ödeme ters yönden', () => {
    const items = openItems([e('al', 'purchase', 5000n, '2026-10-01', '2026-11-01'), e('od', 'out', 2000n, '2026-10-05')], '2026-10-18', 'payable');
    expect(items).toMatchObject([{ id: 'al', open: 3000n, bucket: 'current' }]);
  });

  it('borç tarafı: alacaklı açılış (biz borçluyuz) açık kalem olur ve ödemeler önce onu kapatır', () => {
    const items = openItems([e('acilis', 'opening', -10000n, '2026-01-01'), e('od', 'out', 4000n, '2026-02-01'), e('al', 'purchase', 5000n, '2026-03-01', '2026-11-01')], '2026-10-18', 'payable');
    expect(items.map((i) => [i.id, i.open, i.total])).toEqual([['acilis', 6000n, 10000n], ['al', 5000n, 5000n]]);
  });

  it('iade faturaları: satış iadesi müşteriyi alacaklandırır, alış iadesi tedarikçiyi borçlandırır', () => {
    expect(statement([e('s', 'sales', 1000n, '2026-10-01'), e('si', 'sales_return', 300n, '2026-10-02')]).balance).toBe(700n);
    expect(statement([e('a', 'purchase', 1000n, '2026-10-01'), e('ai', 'purchase_return', 200n, '2026-10-02')]).balance).toBe(-800n);
  });

  it('eşleştirilmiş tahsilat önce seçilen faturayı kapatır, kalanı FIFO', () => {
    const entries = [e('eski', 'sales', 1000n, '2026-08-01', '2026-08-31'), e('yeni', 'sales', 2000n, '2026-09-01', '2026-09-30'), e('t', 'in', 2500n, '2026-10-01')];
    // Eşleştirme yokken eski fatura önce kapanır.
    expect(openItems(entries, '2026-10-18').map((i) => [i.id, i.open])).toEqual([['yeni', 500n]]);
    // 2.000 yeni faturaya eşleşti; kalan 500 eskiye.
    expect(openItems(entries, '2026-10-18', 'receivable', new Map([['yeni', 2000n]])).map((i) => [i.id, i.open])).toEqual([['eski', 500n]]);
  });

  it('fazla tahsilat açık kalem bırakmaz', () => {
    expect(openItems([e('f', 'sales', 1000n, '2026-10-01'), e('t', 'in', 5000n, '2026-10-02')], '2026-10-18')).toEqual([]);
  });
});
