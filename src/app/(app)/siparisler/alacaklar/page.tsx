import { notFound } from 'next/navigation';
import { formatMoney, money, type Currency } from '@/core/money';
import { receivables } from '@/modules/orders/server/queries';
import { requireOrdersPage } from '@/modules/orders/ui/guard';
import { ReceivablesList } from '@/modules/orders/ui/receivables-list';

export default async function ReceivablesPage() {
  await requireOrdersPage();
  const r = await receivables({});
  if (!r.ok) notFound();
  const sums = new Map<Currency, bigint>();
  for (const x of r.data) sums.set(x.currency, (sums.get(x.currency) ?? 0n) + BigInt(x.balance.minor));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Açık sipariş bakiyeleri</h1>
        <p className="text-stone-600">Sipariş tutarı ile tahsilat arasındaki fark. Faturaya dayalı yasal cari bakiye değildir; muhasebe kaydı için faturaları esas alın.</p>
      </div>
      {sums.size > 0 && (
        <p className="text-lg">
          Toplam: <strong className="tabular-nums">{[...sums].map(([c, v]) => formatMoney(money(v, c))).join(' · ')}</strong>
        </p>
      )}
      <ReceivablesList rows={r.data} />
    </div>
  );
}
