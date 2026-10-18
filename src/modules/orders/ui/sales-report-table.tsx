'use client';
import { moneyFromJSON, type Currency } from '@/core/money';
import { DataTable } from '@/ui/data-table';
import { Money } from '@/ui/money';

type MoneyJson = { minor: string; currency: Currency };
type Row = { key: string; label: string; currency: Currency; orders: number; quantity: number; net: MoneyJson; vat: MoneyJson; total: MoneyJson; avgUnitPrice: string; lastUnitPrice: string };

const price = (v: string) => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function SalesReportTable({ rows, groupLabel, showPrices }: { rows: Row[]; groupLabel: string; showPrices: boolean }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => `${r.key}|${r.currency}`}
      empty="Bu aralıkta sipariş yok."
      columns={[
        { key: 'label', header: groupLabel, render: (r) => r.label, sortValue: (r) => r.label },
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
