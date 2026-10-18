'use client';
import { useRouter } from 'next/navigation';
import { formatMoney, moneyFromJSON, type Currency } from '@/core/money';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { Money } from '@/ui/money';
import { ORDER_STATUS_LABELS } from './status-labels';

type MoneyJson = { minor: string; currency: Currency };
type Account = {
  orders: { id: string; no: string; orderDate: string; status: keyof typeof ORDER_STATUS_LABELS; quantity: number; total: MoneyJson; paid: MoneyJson; balance: MoneyJson }[];
  totals: { currency: Currency; total: MoneyJson; paid: MoneyJson; balance: MoneyJson }[];
};

// Cari kartındaki sipariş bazlı hesap özeti. Fatura bazlı değildir; iptal edilen siparişin tahsilatı iade borcu olarak görünür.
export function CustomerAccount({ account }: { account: Account }) {
  const router = useRouter();
  return (
    <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5 sm:p-6">
      <div>
        <h2 className="text-[15px] font-semibold text-stone-900">Sipariş bakiyesi</h2>
        <p className="text-sm text-stone-600">Sipariş tutarları ve tahsilatlar üzerinden; fatura bazlı cari değildir. Eksi bakiye, müşteriye iade edilecek tutardır.</p>
      </div>
      {account.totals.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {account.totals.map((t) => (
            <div key={t.currency} className="rounded-lg bg-stone-50 p-3">
              <p className="text-sm text-stone-500">Bakiye ({t.currency})</p>
              <Money value={moneyFromJSON(t.balance)} className="text-left text-xl font-semibold" />
              <p className="mt-1 text-xs text-stone-500">
                Sipariş {moneyText(t.total)} · Tahsilat {moneyText(t.paid)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <DataTable
        rows={account.orders}
        rowKey={(r) => r.id}
        empty="Bu müşterinin siparişi yok."
        onRowClick={(r) => router.push(`/siparisler/${r.id}`)}
        columns={[
          { key: 'no', header: 'No', render: (r) => <span className="font-mono">{r.no}</span>, sortValue: (r) => r.no },
          { key: 'date', header: 'Tarih', render: (r) => <DateText value={r.orderDate} />, sortValue: (r) => r.orderDate },
          { key: 'status', header: 'Durum', render: (r) => ORDER_STATUS_LABELS[r.status] },
          { key: 'total', header: 'Tutar', align: 'right', render: (r) => <Money value={moneyFromJSON(r.total)} />, sortValue: (r) => BigInt(r.total.minor) },
          { key: 'paid', header: 'Tahsilat', align: 'right', render: (r) => <Money value={moneyFromJSON(r.paid)} />, sortValue: (r) => BigInt(r.paid.minor) },
          { key: 'balance', header: 'Kalan', align: 'right', render: (r) => <Money value={moneyFromJSON(r.balance)} />, sortValue: (r) => BigInt(r.balance.minor) },
        ]}
      />
    </section>
  );
}

const moneyText = (m: MoneyJson) => formatMoney(moneyFromJSON(m));
