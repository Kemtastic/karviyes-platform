'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { Button } from '@/ui/button';
import { useAction } from '@/ui/use-action';
import { startProductionAction } from './actions';
import { stageLabel } from './labels';

const TABS: [string, string][] = [
  ['orders', 'Siparişler'],
  ['fabric', 'Kumaş Ayırma'],
  ['production', 'Üretimde'],
  ['review', 'Kontrol Bekleyen'],
  ['ready', 'Faturaya Hazır'],
  ['shipped', 'Sevk Edilen'],
  ['all', 'Tümü'],
];

type OrderRow = { id: string; no: string; orderDate: string; product: string; quantity: number; partyName: string };
type JobRow = OrderRow & { stage: string; stageStatus: string; fabricReserved: boolean; producedQty: number; shippedQty: number; version: number };
type Data = { kind: 'orders'; rows: OrderRow[] } | { kind: 'jobs'; rows: JobRow[] };

export function BoardScreen({ tab, data, sector, canManage }: { tab: string; data: Data; sector: string; canManage: boolean }) {
  const router = useRouter();
  const start = useAction(startProductionAction);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Üretim panosu</h1>
      <nav aria-label="Pano sekmeleri" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([id, label]) => (
          <Link key={id} href={`/uretim?sekme=${id}`} aria-current={tab === id ? 'page' : undefined} className="whitespace-nowrap rounded-full border border-stone-300 px-4 py-2 text-sm font-medium aria-[current=page]:border-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white">
            {label}
          </Link>
        ))}
      </nav>
      {start.error && <p role="alert" className="text-red-700">{start.error}</p>}
      {data.kind === 'orders' ? (
        <DataTable
          rows={data.rows}
          rowKey={(r) => r.id}
          empty="Üretime alınmayı bekleyen sipariş yok."
          columns={[
            { key: 'no', header: 'Sipariş', render: (r) => <Link className="font-mono underline" href={`/siparisler/${r.id}`}>{r.no}</Link> },
            { key: 'date', header: 'Tarih', render: (r) => <DateText value={r.orderDate} />, sortValue: (r) => r.orderDate },
            { key: 'party', header: 'Müşteri', render: (r) => r.partyName },
            { key: 'product', header: 'Ürün', render: (r) => <span className="text-stone-600">{r.product}</span> },
            { key: 'qty', header: 'Adet', align: 'right', render: (r) => r.quantity.toLocaleString('tr-TR') },
            { key: 'go', header: '', render: (r) => canManage && <Button disabled={start.pending} onClick={() => start.run({ orderId: r.id }, (d) => router.push(`/uretim/is/${d.id}`))}>Üretime al</Button> },
          ]}
        />
      ) : (
        <DataTable
          rows={data.rows}
          rowKey={(r) => r.id}
          empty="Bu sekmede iş yok."
          onRowClick={(r) => router.push(`/uretim/is/${r.id}`)}
          columns={[
            { key: 'no', header: 'İş', render: (r) => <span className="font-mono">{r.no}</span>, sortValue: (r) => r.no },
            { key: 'date', header: 'Sipariş tarihi', render: (r) => <DateText value={r.orderDate} />, sortValue: (r) => r.orderDate },
            { key: 'party', header: 'Müşteri', render: (r) => r.partyName, sortValue: (r) => r.partyName },
            { key: 'product', header: 'Ürün', render: (r) => <span className="text-stone-600">{r.product}</span> },
            { key: 'qty', header: 'Adet', align: 'right', render: (r) => r.quantity.toLocaleString('tr-TR') },
            { key: 'done', header: 'Üretilen / sevk', align: 'right', render: (r) => `${r.producedQty.toLocaleString('tr-TR')} / ${r.shippedQty.toLocaleString('tr-TR')}` },
            {
              key: 'stage',
              header: 'Aşama',
              render: (r) => (
                <span>
                  {stageLabel(sector, r.stage)}
                  {r.stageStatus === 'in_progress' && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">işlemde</span>}
                  {r.stage === 'waiting' && !r.fabricReserved && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">kumaş yok</span>}
                </span>
              ),
              sortValue: (r) => r.stage,
            },
          ]}
        />
      )}
    </div>
  );
}
