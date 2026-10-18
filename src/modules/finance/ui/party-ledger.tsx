'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, FileText, Receipt, Scale } from 'lucide-react';
import { formatMoney, money, type Currency } from '@/core/money';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { DateText } from '@/ui/date-text';
import { EmptyState } from '@/ui/empty-state';
import { Money } from '@/ui/money';
import { InvoiceDialog, OpeningDialog, PaymentDialog, type AccountOption, type PartyRef } from './dialogs';
import { AGING_LABELS } from './labels';

type Row = { id: string; date: string; due: string | null; kind: string; text: string; debit: string; credit: string; balance: string };
type Item = { id: string; date: string; due: string | null; total: string; open: string; daysOverdue: number; bucket: string; text: string };
export type Ledger = { currencies: { currency: Currency; carried: string; balance: string; rows: Row[]; receivable: Item[]; payable: Item[] }[] };

type Dialog = 'sales' | 'purchase' | 'sales_return' | 'purchase_return' | 'collection' | 'payment' | 'opening' | null;

export function PartyLedger({ party, kind, ledger, accounts, from }: { party: PartyRef; kind: string; ledger: Ledger; accounts: AccountOption[]; from: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Dialog>(null);
  const close = () => setOpen(null);
  const done = () => { setOpen(null); router.refresh(); };
  const isCustomer = kind !== 'supplier';
  const isSupplier = kind !== 'customer';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {isCustomer && <Button onClick={() => setOpen('collection')}><ArrowDownLeft aria-hidden className="h-4 w-4" /> Tahsilat al</Button>}
        {isSupplier && <Button variant={isCustomer ? 'secondary' : 'primary'} onClick={() => setOpen('payment')}><ArrowUpRight aria-hidden className="h-4 w-4" /> Ödeme yap</Button>}
        {isCustomer && <Button variant="secondary" onClick={() => setOpen('sales')}><Receipt aria-hidden className="h-4 w-4" /> Satış faturası</Button>}
        {isSupplier && <Button variant="secondary" onClick={() => setOpen('purchase')}><Receipt aria-hidden className="h-4 w-4" /> Alış faturası</Button>}
        {isCustomer && <Button variant="ghost" onClick={() => setOpen('sales_return')}>Satış iadesi</Button>}
        {isSupplier && <Button variant="ghost" onClick={() => setOpen('purchase_return')}>Alış iadesi</Button>}
        <Button variant="ghost" onClick={() => setOpen('opening')}><Scale aria-hidden className="h-4 w-4" /> Açılış bakiyesi</Button>
        <Link href={`/muhasebe/mutabakat?cari=${party.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100"><FileText aria-hidden className="h-4 w-4" /> Mutabakat</Link>
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col text-xs font-medium text-stone-600">Ekstre başlangıcı<input type="date" name="bas" defaultValue={from} className="mt-1 min-h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm shadow-sm" /></label>
        <button className="min-h-10 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white">Göster</button>
        {from && <Link href="?" className="min-h-10 px-2 py-2.5 text-stone-600 underline">Tümü</Link>}
      </form>
      {ledger.currencies.length ? (
        ledger.currencies.map((c) => <CurrencyLedger key={c.currency} c={c} />)
      ) : (
        <EmptyState title="Bu carinin muhasebe kaydı yok." hint="Fatura kaydı, tahsilat ya da açılış bakiyesi girerek başlayın." />
      )}
      {(open === 'sales' || open === 'purchase' || open === 'sales_return' || open === 'purchase_return') && <InvoiceDialog kind={open} party={party} onClose={close} onDone={done} />}
      {(open === 'collection' || open === 'payment') && <PaymentDialog kind={open} party={party} accounts={accounts} onClose={close} onDone={done} />}
      {open === 'opening' && <OpeningDialog party={party} onClose={close} onDone={done} />}
    </div>
  );
}

function CurrencyLedger({ c }: { c: Ledger['currencies'][number] }) {
  const bal = BigInt(c.balance);
  const fm = (v: string) => formatMoney(money(v, c.currency));
  const items = [...c.receivable.map((i) => ({ ...i, side: 'Alacak' })), ...c.payable.map((i) => ({ ...i, side: 'Borç' }))];
  return (
    <section aria-label={`${c.currency} hesabı`} className="space-y-4">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-[var(--shadow-card)] ${bal > 0n ? 'border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)]' : 'border-stone-200/80 bg-white'}`}>
        <span>
          <span className="block text-xs font-medium uppercase tracking-wide text-stone-500">Bakiye ({c.currency})</span>
          <span className="block text-2xl font-semibold tabular-nums">{fm((bal < 0n ? -bal : bal).toString())}</span>
        </span>
        <Badge tone={bal > 0n ? 'brand' : bal < 0n ? 'warning' : 'success'}>{bal > 0n ? 'Cari bize borçlu' : bal < 0n ? 'Biz cariye borçluyuz' : 'Kapalı'}</Badge>
      </div>
      {items.length > 0 && (
        <Card title="Açık kalemler" description="Ödemeler en eski vadeden başlayarak kapatılır." padded={false}>
          <ul className="divide-y divide-stone-100">
            {items.map((i) => (
              <li key={`${i.side}-${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  <span className="block font-medium text-stone-900">{i.text}</span>
                  <span className="block text-xs text-stone-500">{i.side} · vade {i.due ? <DateText value={i.due} /> : 'yok'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={i.daysOverdue > 60 ? 'danger' : i.daysOverdue > 0 ? 'warning' : 'neutral'} dot={i.daysOverdue > 0}>{i.daysOverdue > 0 ? `${i.daysOverdue} gün gecikti` : AGING_LABELS[i.bucket]}</Badge>
                  <span className="w-32 text-right font-semibold tabular-nums">{fm(i.open)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Ekstre" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-4 py-3 text-left font-semibold">Tarih</th><th className="px-4 py-3 text-left font-semibold">Açıklama</th><th className="px-4 py-3 text-right font-semibold">Borç</th><th className="px-4 py-3 text-right font-semibold">Alacak</th><th className="px-4 py-3 text-right font-semibold">Bakiye</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {c.carried !== '0' && (
                <tr className="bg-stone-50/60 text-stone-600"><td className="px-4 py-2.5" /><td className="px-4 py-2.5 italic">Önceki dönemden devir</td><td /><td /><td className="px-4 py-2.5 text-right"><Money value={money(c.carried, c.currency)} /></td></tr>
              )}
              {c.rows.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/70">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-stone-600"><DateText value={r.date} /></td>
                  <td className="px-4 py-2.5">{r.text}{r.due && <span className="ml-2 text-xs text-stone-400">vade <DateText value={r.due} /></span>}</td>
                  <td className="px-4 py-2.5 text-right">{r.debit !== '0' ? <Money value={money(r.debit, c.currency)} /> : ''}</td>
                  <td className="px-4 py-2.5 text-right">{r.credit !== '0' ? <Money value={money(r.credit, c.currency)} /> : ''}</td>
                  <td className="px-4 py-2.5 text-right font-medium"><Money value={money(r.balance, c.currency)} /></td>
                </tr>
              ))}
              {!c.rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-500">Bu tarihten sonra hareket yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
