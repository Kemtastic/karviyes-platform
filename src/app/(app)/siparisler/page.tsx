import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listOrders, ORDER_STATUS_LABELS } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderList } from '@/modules/orders/ui/order-list';
import { ORDER_STATUSES } from '@/modules/orders/db/schema';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  await requireOrdersPage();
  const { durum } = await searchParams;
  const status = (ORDER_STATUSES as readonly string[]).includes(durum ?? '') ? (durum as (typeof ORDER_STATUSES)[number]) : undefined;
  const r = await listOrders({ status });
  if (!r.ok) notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Siparişler</h1>
        <Link href="/siparisler/yeni" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 font-semibold text-white">Yeni sipariş</Link>
      </div>
      <nav aria-label="Durum" className="flex flex-wrap gap-2">
        <Link href="/siparisler" aria-current={!status ? 'page' : undefined} className="rounded-full border px-3 py-1 text-sm aria-[current=page]:bg-stone-900 aria-[current=page]:text-white">Tümü</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/siparisler?durum=${s}`} aria-current={status === s ? 'page' : undefined} className="rounded-full border px-3 py-1 text-sm aria-[current=page]:bg-stone-900 aria-[current=page]:text-white">
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>
      <OrderList rows={r.data} />
    </div>
  );
}
