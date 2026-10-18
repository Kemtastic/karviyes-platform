'use client';
import { moneyFromJSON, type Currency } from '@/core/money';
import { DataTable } from '@/ui/data-table';
import { Money } from '@/ui/money';

type MoneyJson = { minor: string; currency: Currency };
type Row = { key: string; label: string; currency: Currency; orders: number; quantity: number; net: MoneyJson; vat: MoneyJson; total: MoneyJson; avgUnitPrice: string; lastUnitPrice: string };

const price = (v: string) => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function SalesReportTable({ rows, groupLabel, showPrices }: { rows: Row[]; groupLabel: string; showPrices: boolean }) {
  // Pay: aynı para birimindeki en büyük toplama göre çubuk.
  const max = new Map<string, bigint>();
  for (const r of rows) if (BigInt(r.total.minor) > (max.get(r.currency) ?? 0n)) max.set(r.currency, BigInt(r.total.minor));
  const share = (r: Row) => {
    const m = max.get(r.currency) ?? 0n;
    return m > 0n ? Number((BigInt(r.total.minor) * 1000n) / m) / 10 : 0;
  };
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => `${r.key}|${r.currency}`}
      empty="Bu aralıkta sipariş yok."
      columns={[
        {
          key: 'label', header: groupLabel, sortValue: (r) => r.label,
          render: (r) => (
            <span className="block min-w-44">
              <span className="font-medium text-stone-900">{r.label}</span>
              <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-stone-100">
                <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${share(r)}%` }} />
              </span>
            </span>
          ),
        },
        { key: 'cur', header: 'Para birimi', render: (r) => r.currency },
        { key: 'orders', header: 'Sipariş', align: 'right', render: (r) => r.orders, sortValue: (r) => r.orders },
        { key: 'qty', header: 'Adet', align: 'right', render: (r) => r.quantity.toLocaleString('tr-TR'), sortValue: (r) => r.quantity },
        ...(showPrices
          ? [
              { key: 'avg', header: 'Ort. birim fiyat', align: 'right' as const, render: (r: Row) => price(r.avgUnitPrice), sortValue: (r: Row) => Number(r.avgUnitPrice) },
              { key: 'last', header: 'Son fiyat', align: 'right' as const, render: (r: Row) => price(r.lastUnitPrice) },
            ]
          : []),
        { key: 'net', header: 'KDV hariç', align: 'right', render: (r) => <Money value={moneyFromJSON(r.net)} />, sortValue: (r) => BigInt(r.net.minor) },
        { key: 'vat', header: 'KDV', align: 'right', render: (r) => <Money value={moneyFromJSON(r.vat)} />, sortValue: (r) => BigInt(r.vat.minor) },
        { key: 'total', header: 'Toplam', align: 'right', render: (r) => <Money value={moneyFromJSON(r.total)} />, sortValue: (r) => BigInt(r.total.minor) },
      ]}
    />
  );
}
