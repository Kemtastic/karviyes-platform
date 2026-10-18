'use client';
import { useRouter } from 'next/navigation';
import { money, type Currency } from '@/core/money';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { Money } from '@/ui/money';

type AgingJson = Record<string, string | number>;
export type BalanceRow = { partyId: string; partyName: string; kind: string; phone: string; currency: Currency; balance: string; receivable: AgingJson; payable: AgingJson; lastDate: string };

const m = (v: string | number | undefined, c: Currency) => <Money value={money(String(v ?? '0'), c)} />;

/** Cari bakiyeler ve yaşlandırma: alacak görünümünde gecikme kovaları, borç görünümünde tedarikçi vadeleri. */
export function BalancesTable({ rows, side }: { rows: BalanceRow[]; side: 'receivable' | 'payable' }) {
  const router = useRouter();
  const pick = (r: BalanceRow) => (side === 'receivable' ? r.receivable : r.payable);
  const shown = rows.filter((r) => BigInt(String(pick(r).total)) > 0n || (side === 'receivable' ? BigInt(r.balance) > 0n : BigInt(r.balance) < 0n));
  return (
    <DataTable
      rows={shown}
      rowKey={(r) => `${r.partyId}-${r.currency}`}
      empty={side === 'receivable' ? 'Açık alacak yok.' : 'Açık borç yok.'}
      onRowClick={(r) => router.push(`/muhasebe/cariler/${r.partyId}`)}
      columns={[
        { key: 'party', header: 'Cari', mobile: 'title', render: (r) => <span className="block min-w-44 font-medium text-stone-900">{r.partyName}</span>, sortValue: (r) => r.partyName },
        { key: 'balance', header: 'Bakiye', align: 'right', render: (r) => m(r.balance, r.currency), sortValue: (r) => BigInt(r.balance) },
        { key: 'open', header: side === 'receivable' ? 'Açık alacak' : 'Açık borç', align: 'right', render: (r) => <strong>{m(pick(r).total, r.currency)}</strong>, sortValue: (r) => BigInt(String(pick(r).total)) },
        { key: 'current', header: 'Vadesi gelmemiş', align: 'right', mobile: 'hide', render: (r) => m(BigInt(String(pick(r).current)) + BigInt(String(pick(r).unplanned)) + '', r.currency) },
        { key: 'd30', header: '1–30 gün', align: 'right', render: (r) => <Late v={pick(r).d1_30} c={r.currency} /> },
        { key: 'd60', header: '31–90 gün', align: 'right', render: (r) => <Late v={(BigInt(String(pick(r).d31_60)) + BigInt(String(pick(r).d61_90))).toString()} c={r.currency} /> },
        { key: 'd90', header: '90+ gün', align: 'right', render: (r) => <Late v={(BigInt(String(pick(r).d91_120)) + BigInt(String(pick(r).d120p))).toString()} c={r.currency} strong /> },
        { key: 'days', header: 'Ort. gecikme', align: 'right', mobile: 'hide', render: (r) => (Number(pick(r).weightedDays) > 0 ? `${pick(r).weightedDays} gün` : '—'), sortValue: (r) => Number(pick(r).weightedDays) },
        { key: 'last', header: 'Son hareket', mobile: 'hide', render: (r) => (r.lastDate ? <DateText value={r.lastDate} /> : '—'), sortValue: (r) => r.lastDate },
      ]}
    />
  );
}

function Late({ v, c, strong }: { v: string | number | undefined; c: Currency; strong?: boolean }) {
  const n = BigInt(String(v ?? '0'));
  if (n === 0n) return <span className="block text-right text-stone-300">—</span>;
  return <span className={`block rounded-md px-1.5 text-right ${strong ? 'bg-red-50 font-semibold text-red-700' : 'bg-amber-50 text-amber-800'}`}><Money value={money(n, c)} /></span>;
}
