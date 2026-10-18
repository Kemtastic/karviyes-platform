import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileDown, Plus } from 'lucide-react';
import { listOrders, ORDER_STATUS_LABELS } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { OrderList } from '@/modules/orders/ui/order-list';
import { ORDER_STATUSES } from '@/modules/orders/db/schema';
import { buttonClasses } from '@/ui/button';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string; bas?: string; bit?: string }> }) {
  await requireOrdersPage();
  const { durum, q = '', bas = '', bit = '' } = await searchParams;
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const status = (ORDER_STATUSES as readonly string[]).includes(durum ?? '') ? (durum as (typeof ORDER_STATUSES)[number]) : undefined;
  const r = await listOrders({ status, q: q.trim().slice(0, 100) || undefined, from: date(bas), to: date(bit) });
  if (!r.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Siparişler"
        description="Müşteri siparişleri, tutarları ve kalan bakiyeleri. Satıra tıklayınca sipariş kartı açılır."
        actions={
          <>
            <a href={`/api/disa-aktar/siparisler${status ? `?durum=${status}` : ''}`} className={buttonClasses('secondary')}>
              <FileDown aria-hidden className="h-4 w-4" /> Excel&apos;e aktar
            </a>
            <Link href="/siparisler/yeni" className={buttonClasses('primary')}>
              <Plus aria-hidden className="h-4 w-4" /> Yeni sipariş
            </Link>
          </>
        }
      />
      <LinkTabs
        label="Durum"
        items={[
          { href: '/siparisler', label: 'Tümü', active: !status },
          ...ORDER_STATUSES.map((s) => ({ href: `/siparisler?durum=${s}`, label: ORDER_STATUS_LABELS[s], active: status === s })),
        ]}
      />
      <FilterBar search>
        {status && <input type="hidden" name="durum" value={status} />}
        <FilterField label="Ara"><input name="q" defaultValue={q} placeholder="Müşteri veya sipariş no" className={`${filterInputClass} w-64`} /></FilterField>
        <FilterField label="Başlangıç"><input type="date" name="bas" defaultValue={bas} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="bit" defaultValue={bit} className={filterInputClass} /></FilterField>
        <button className={filterButtonClass}>Süz</button>
        {(q || bas || bit) && <Link href={status ? `/siparisler?durum=${status}` : '/siparisler'} className="min-h-10 content-center px-2 text-sm font-medium text-stone-600 underline-offset-2 hover:underline">Temizle</Link>}
      </FilterBar>
      <OrderList rows={r.data} />
    </div>
  );
}
