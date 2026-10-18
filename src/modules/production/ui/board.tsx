'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/ui/badge';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { Button } from '@/ui/button';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';
import { useAction } from '@/ui/use-action';
import { startProductionAction } from './actions';
import { stageLabel, stageTone } from './labels';

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

// Üretilen / hedef oranı (kesim bitişten sonra dolar).
function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span className="block min-w-28">
      <span className="flex justify-between text-xs tabular-nums text-stone-600">
        <span>{done.toLocaleString('tr-TR')}</span>
        <span className="text-stone-400">%{pct}</span>
      </span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-stone-100">
        <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

export function BoardScreen({ tab, data, sector, canManage }: { tab: string; data: Data; sector: string; canManage: boolean }) {
  const router = useRouter();
  const start = useAction(startProductionAction);
  return (
    <div className="space-y-5">
      <PageHeader title="Üretim panosu" description="Siparişlerin üretimdeki yeri: kumaş ayırma, bölümler, kontrol ve sevk. İşe tıklayınca iş kartı açılır." />
      <LinkTabs label="Pano sekmeleri" items={TABS.map(([id, label]) => ({ href: `/uretim?sekme=${id}`, label, active: tab === id }))} />
      {start.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{start.error}</p>}
      {data.kind === 'orders' ? (
        <DataTable
          rows={data.rows}
          rowKey={(r) => r.id}
          empty="Üretime alınmayı bekleyen sipariş yok."
          columns={[
            { key: 'no', header: 'Sipariş', render: (r) => <Link className="whitespace-nowrap font-mono text-xs font-medium text-stone-700 underline-offset-2 hover:underline" href={`/siparisler/${r.id}`}>{r.no}</Link> },
            { key: 'date', header: 'Tarih', render: (r) => <DateText value={r.orderDate} />, sortValue: (r) => r.orderDate },
            { key: 'party', header: 'Müşteri', render: (r) => <span className="font-medium">{r.partyName}</span> },
            { key: 'product', header: 'Ürün', render: (r) => <span className="line-clamp-2 max-w-md text-stone-600">{r.product}</span> },
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
            { key: 'no', header: 'İş', render: (r) => <span className="whitespace-nowrap font-mono text-xs font-medium text-stone-700">{r.no}</span>, sortValue: (r) => r.no },
            { key: 'date', header: 'Sipariş tarihi', render: (r) => <DateText value={r.orderDate} />, sortValue: (r) => r.orderDate },
            { key: 'party', header: 'Müşteri', render: (r) => <span className="font-medium">{r.partyName}</span>, sortValue: (r) => r.partyName },
            { key: 'product', header: 'Ürün', render: (r) => <span className="line-clamp-2 max-w-sm text-stone-600">{r.product}</span> },
            { key: 'qty', header: 'Adet', align: 'right', render: (r) => r.quantity.toLocaleString('tr-TR') },
            { key: 'done', header: 'Üretilen / sevk', render: (r) => <span className="block"><Progress done={r.producedQty} total={r.quantity} />{r.shippedQty > 0 && <span className="mt-1 block text-xs text-stone-500">sevk {r.shippedQty.toLocaleString('tr-TR')}</span>}</span> },
            {
              key: 'stage',
              header: 'Aşama',
              render: (r) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={stageTone(r.stage)}>{stageLabel(sector, r.stage)}</Badge>
                  {r.stageStatus === 'in_progress' && <Badge tone="info" dot={false}>işlemde</Badge>}
                  {r.stage === 'waiting' && !r.fabricReserved && <Badge tone="warning" dot={false}>kumaş yok</Badge>}
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
