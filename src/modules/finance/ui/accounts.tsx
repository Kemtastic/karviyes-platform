'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Landmark, Plus, Repeat, Wallet } from 'lucide-react';
import { formatMoney, money, type Currency } from '@/core/money';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { PageHeader } from '@/ui/page-header';
import { AccountDialog, TransferDialog } from './dialogs';

export type AccountRow = { id: string; kind: string; name: string; currency: Currency; bank: string; iban: string; archived: boolean; version: number; opening: string; openingDate: string; balance: string };

export function AccountsScreen({ rows }: { rows: AccountRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<'account' | 'transfer' | null>(null);
  const done = () => { setOpen(null); router.refresh(); };
  const totals = new Map<Currency, bigint>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0n) + BigInt(r.balance));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Kasa ve banka"
        description="Hesapların bakiyesi açılış tutarı ve hareketlerden hesaplanır. Hesaba tıklayınca ekstresi açılır."
        actions={
          <>
            <Button onClick={() => setOpen('account')}><Plus aria-hidden className="h-4 w-4" /> Hesap aç</Button>
            {rows.length > 1 && <Button variant="secondary" onClick={() => setOpen('transfer')}><Repeat aria-hidden className="h-4 w-4" /> Virman</Button>}
          </>
        }
      />
      {totals.size > 0 && (
        <p className="flex flex-wrap gap-2 text-sm text-stone-600">
          Toplam: {[...totals].map(([c, v]) => <strong key={c} className="rounded-lg bg-white px-2 py-0.5 tabular-nums shadow-sm">{formatMoney(money(v, c))}</strong>)}
        </p>
      )}
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => {
            const Icon = a.kind === 'cash' ? Wallet : Landmark;
            const negative = BigInt(a.balance) < 0n;
            return (
              <Link key={a.id} href={`/muhasebe/hesaplar/${a.id}`} className="group rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)]"><Icon aria-hidden className="h-5 w-5" /></span>
                    <span>
                      <span className="block font-semibold text-stone-900">{a.name}</span>
                      <span className="block text-xs text-stone-500">{a.kind === 'cash' ? 'Kasa' : a.bank || 'Banka'}</span>
                    </span>
                  </span>
                  <Badge tone="neutral" dot={false}>{a.currency}</Badge>
                </span>
                <span className={`mt-5 block text-2xl font-semibold tabular-nums tracking-tight ${negative ? 'text-red-700' : 'text-stone-900'}`}>{formatMoney(money(a.balance, a.currency))}</span>
                {a.iban && <span className="mt-1 block truncate font-mono text-xs text-stone-500">{a.iban.replace(/(.{4})/g, '$1 ').trim()}</span>}
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Henüz kasa veya banka hesabı yok." hint="Tahsilat, ödeme ve masraf girebilmek için en az bir hesap açın." action={<Button variant="secondary" onClick={() => setOpen('account')}>İlk hesabı aç</Button>} />
      )}
      {open === 'account' && <AccountDialog onClose={() => setOpen(null)} onDone={done} />}
      {open === 'transfer' && <TransferDialog accounts={rows} onClose={() => setOpen(null)} onDone={done} />}
    </div>
  );
}
