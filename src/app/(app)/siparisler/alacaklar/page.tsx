import { notFound } from 'next/navigation';
import { formatMoney, money, type Currency } from '@/core/money';
import { receivables } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { ReceivablesList } from '@/modules/orders/ui/receivables-list';
import { PageHeader } from '@/ui/page-header';

export default async function ReceivablesPage() {
  await requireOrdersPage();
  const r = await receivables({});
  if (!r.ok) notFound();
  const sums = new Map<Currency, bigint>();
  for (const x of r.data) sums.set(x.currency, (sums.get(x.currency) ?? 0n) + BigInt(x.balance.minor));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Açık sipariş bakiyeleri"
        description="Sipariş tutarı ile tahsilat arasındaki fark. Faturaya dayalı yasal cari bakiye değildir; muhasebe kaydı için faturaları esas alın."
      />
      {sums.size > 0 && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...sums].map(([c, v]) => (
            <div key={c} className="rounded-2xl border border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)] p-4 shadow-[var(--shadow-card)]">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Toplam açık bakiye ({c})</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(money(v, c))}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Müşteri</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{new Set(r.data.map((x) => x.partyId)).size}</p>
          </div>
        </section>
      )}
      <ReceivablesList rows={r.data} />
    </div>
  );
}
