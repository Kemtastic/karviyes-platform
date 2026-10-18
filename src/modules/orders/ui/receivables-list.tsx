'use client';
import { useRouter } from 'next/navigation';
import { moneyFromJSON, type Currency } from '@/core/money';
import { DataTable } from '@/ui/data-table';
import { Money } from '@/ui/money';

type Row = { partyId: string; partyName: string; phone: string; currency: Currency; orderCount: number; balance: { minor: string; currency: Currency } };

export function ReceivablesList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => `${r.partyId}:${r.currency}`}
      empty="Açık alacak yok."
      onRowClick={(r) => router.push(`/cariler/${r.partyId}`)}
      columns={[
        { key: 'party', header: 'Müşteri', render: (r) => <span className="font-medium text-stone-900">{r.partyName}</span>, sortValue: (r) => r.partyName },
        { key: 'phone', header: 'Telefon', render: (r) => (r.phone ? <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-stone-700 hover:text-stone-900 hover:underline">{r.phone}</a> : '—') },
        { key: 'count', header: 'Sipariş', align: 'right', render: (r) => r.orderCount, sortValue: (r) => r.orderCount },
        { key: 'balance', header: 'Alacak', align: 'right', render: (r) => <Money value={moneyFromJSON(r.balance)} />, sortValue: (r) => BigInt(r.balance.minor) },
      ]}
    />
  );
}
