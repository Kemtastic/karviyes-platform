'use client';
import { useRouter } from 'next/navigation';
import { moneyFromJSON, type Currency } from '@/core/money';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { Money } from '@/ui/money';
import { Badge } from '@/ui/badge';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from './status-labels';

type Row = { id: string; no: string; orderDate: string; partyName: string; status: keyof typeof ORDER_STATUS_LABELS; quantity: number; product: string; total: { minor: string; currency: Currency }; balance: { minor: string; currency: Currency } };

export function OrderList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      empty="Bu durumda sipariş yok."
      onRowClick={(r) => router.push(`/siparisler/${r.id}`)}
      columns={[
        { key: 'no', header: 'No', render: (r) => <span className="font-mono text-xs font-medium text-stone-600">{r.no}</span>, sortValue: (r) => r.no },
        { key: 'date', header: 'Tarih', render: (r) => <DateText value={r.orderDate} />, sortValue: (r) => r.orderDate },
        { key: 'party', header: 'Müşteri', render: (r) => <span className="font-medium text-stone-900">{r.partyName}</span>, sortValue: (r) => r.partyName },
        { key: 'product', header: 'Ürün', render: (r) => <span className="line-clamp-2 max-w-sm text-stone-600">{r.product}</span> },
        { key: 'qty', header: 'Adet', align: 'right', render: (r) => r.quantity.toLocaleString('tr-TR'), sortValue: (r) => r.quantity },
        { key: 'total', header: 'Tutar', align: 'right', render: (r) => <Money value={moneyFromJSON(r.total)} />, sortValue: (r) => BigInt(r.total.minor) },
        { key: 'balance', header: 'Kalan', align: 'right', render: (r) => <Money value={moneyFromJSON(r.balance)} />, sortValue: (r) => BigInt(r.balance.minor) },
        { key: 'status', header: 'Durum', render: (r) => <Badge tone={ORDER_STATUS_TONES[r.status]}>{ORDER_STATUS_LABELS[r.status]}</Badge>, sortValue: (r) => r.status },
      ]}
    />
  );
}
