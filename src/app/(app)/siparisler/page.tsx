import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listOrders, ORDER_STATUS_LABELS } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderList } from '@/modules/orders/ui/order-list';
import { ORDER_STATUSES } from '@/modules/orders/db/schema';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string; bas?: string; bit?: string }> }) {
  await requireOrdersPage();
  const { durum, q = '', bas = '', bit = '' } = await searchParams;
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const status = (ORDER_STATUSES as readonly string[]).includes(durum ?? '') ? (durum as (typeof ORDER_STATUSES)[number]) : undefined;
  const r = await listOrders({ status, q: q.trim().slice(0, 100) || undefined, from: date(bas), to: date(bit) });
  if (!r.ok) notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Siparişler</h1>
        <div className="flex gap-2">
          <a href={`/api/disa-aktar/siparisler${status ? `?durum=${status}` : ''}`} className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">Excel&apos;e aktar</a>
          <Link href="/siparisler/yeni" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 font-semibold text-white">Yeni sipariş</Link>
        </div>
      </div>
      <nav aria-label="Durum" className="flex flex-wrap gap-2">
        <Link href="/siparisler" aria-current={!status ? 'page' : undefined} className="rounded-full border px-3 py-1 text-sm aria-[current=page]:bg-stone-900 aria-[current=page]:text-white">Tümü</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/siparisler?durum=${s}`} aria-current={status === s ? 'page' : undefined} className="rounded-full border px-3 py-1 text-sm aria-[current=page]:bg-stone-900 aria-[current=page]:text-white">
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>
      <form role="search" className="flex flex-wrap items-end gap-2">
        {status && <input type="hidden" name="durum" value={status} />}
        <label className="flex flex-col text-sm">Ara<input name="q" defaultValue={q} placeholder="Müşteri veya sipariş no" className="min-h-11 rounded-lg border border-stone-300 px-3" /></label>
        <label className="flex flex-col text-sm">Başlangıç<input type="date" name="bas" defaultValue={bas} className="min-h-11 rounded-lg border border-stone-300 px-3" /></label>
        <label className="flex flex-col text-sm">Bitiş<input type="date" name="bit" defaultValue={bit} className="min-h-11 rounded-lg border border-stone-300 px-3" /></label>
        <button className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">Süz</button>
        {(q || bas || bit) && <Link href={status ? `/siparisler?durum=${status}` : '/siparisler'} className="min-h-11 content-center px-2 text-sm underline">Temizle</Link>}
      </form>
      <OrderList rows={r.data} />
    </div>
  );
}
