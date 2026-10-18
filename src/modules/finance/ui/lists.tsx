'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMoney, money, type Currency } from '@/core/money';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { Money } from '@/ui/money';
import { cancelInvoiceAction, returnCheckAction, reverseMovementAction } from './actions';
import { EndorseCheckDialog, ReasonDialog, SettleCheckDialog, type AccountOption } from './dialogs';
import { CHECK_LABELS, CHECK_TONES, MOVEMENT_LABELS, MOVEMENT_TONES } from './labels';

const small = 'min-h-9 px-3';

export type InvoiceRow = { id: string; kind: string; partyId: string; partyName: string; docNo: string; date: string; due: string | null; currency: Currency; base: string; vat: string; withholding: string; total: string; note: string; status: string; cancelNote: string | null };

export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState<InvoiceRow | null>(null);
  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Bu aralıkta fatura kaydı yok."
        columns={[
          { key: 'date', header: 'Tarih', render: (r) => <DateText value={r.date} />, sortValue: (r) => r.date },
          { key: 'party', header: 'Cari', mobile: 'title', render: (r) => <Link href={`/muhasebe/cariler/${r.partyId}`} className="font-medium text-stone-900 hover:underline">{r.partyName}</Link>, sortValue: (r) => r.partyName },
          { key: 'no', header: 'Fatura no', render: (r) => <span className="whitespace-nowrap font-mono text-xs text-stone-700">{r.docNo}</span> },
          { key: 'kind', header: 'Tür', render: (r) => <Badge tone={r.kind === 'sales' ? 'brand' : 'neutral'} dot={false}>{r.kind === 'sales' ? 'Satış' : 'Alış'}</Badge> },
          { key: 'due', header: 'Vade', render: (r) => (r.due ? <DateText value={r.due} /> : <span className="text-stone-400">—</span>), sortValue: (r) => r.due ?? '' },
          { key: 'base', header: 'Matrah', align: 'right', mobile: 'hide', render: (r) => <Money value={money(r.base, r.currency)} /> },
          { key: 'vat', header: 'KDV', align: 'right', mobile: 'hide', render: (r) => <span className="block text-right"><Money value={money(r.vat, r.currency)} />{r.withholding !== '0' && <span className="block text-xs text-stone-500">tevkifat −{formatMoney(money(r.withholding, r.currency))}</span>}</span> },
          { key: 'total', header: 'Toplam', align: 'right', render: (r) => <span className={r.status === 'cancelled' ? 'text-stone-400 line-through' : 'font-semibold'}><Money value={money(r.total, r.currency)} /></span>, sortValue: (r) => BigInt(r.total) },
          { key: 'status', header: 'Durum', render: (r) => (r.status === 'cancelled' ? <span title={r.cancelNote ?? ''}><Badge tone="muted">İptal</Badge></span> : <Badge tone="success">Kayıtlı</Badge>) },
          { key: 'act', header: '', render: (r) => r.status === 'recorded' && <Button variant="ghost" className={`${small} text-red-700 hover:bg-red-50`} onClick={() => setCancelling(r)}>İptal et</Button> },
        ]}
      />
      {cancelling && (
        <ReasonDialog
          title="Fatura kaydını iptal et"
          text={`${cancelling.partyName} · ${cancelling.docNo}. Kayıt silinmez, iptal olarak işaretlenir ve bakiyeden düşer. Resmî faturanın iptali ayrıca e-Fatura/e-Arşiv tarafında yapılmalıdır.`}
          label="İptal et"
          run={(reason) => cancelInvoiceAction({ id: cancelling.id, reason })}
          onClose={() => setCancelling(null)}
          onDone={() => { setCancelling(null); router.refresh(); }}
        />
      )}
    </>
  );
}

export type MovementRow = { id: string; kind: string; direction: string; partyId: string | null; partyName: string | null; accountName: string | null; amount: string; vat: string; currency: Currency; date: string; category: string; note: string; reversed: boolean; reverseReason: string | null; check: boolean; transfer: boolean };

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
  const router = useRouter();
  const [reversing, setReversing] = useState<MovementRow | null>(null);
  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Bu aralıkta hareket yok."
        columns={[
          { key: 'date', header: 'Tarih', render: (r) => <DateText value={r.date} />, sortValue: (r) => r.date },
          { key: 'kind', header: 'Tür', render: (r) => <Badge tone={r.reversed ? 'muted' : MOVEMENT_TONES[r.kind]} dot={false}>{MOVEMENT_LABELS[r.kind] ?? r.kind}{r.kind === 'transfer' ? (r.direction === 'in' ? ' (giriş)' : ' (çıkış)') : ''}</Badge> },
          {
            key: 'who', header: 'Cari / kategori', mobile: 'title',
            render: (r) => (
              <span className="block">
                {r.partyId ? <Link href={`/muhasebe/cariler/${r.partyId}`} className="font-medium text-stone-900 hover:underline">{r.partyName}</Link> : <span className="font-medium text-stone-900">{r.category || MOVEMENT_LABELS[r.kind]}</span>}
                {r.note && <span className="block text-xs text-stone-500">{r.note}</span>}
              </span>
            ),
          },
          { key: 'account', header: 'Hesap', render: (r) => r.accountName ?? <span className="text-stone-400">—</span> },
          {
            key: 'amount', header: 'Tutar', align: 'right',
            render: (r) => <span className={`block text-right font-semibold ${r.reversed ? 'text-stone-400 line-through' : r.direction === 'in' ? 'text-emerald-700' : 'text-stone-900'}`}>{r.direction === 'in' ? '+' : '−'}{formatMoney(money(r.amount, r.currency))}</span>,
            sortValue: (r) => BigInt(r.amount),
          },
          { key: 'state', header: 'Durum', mobile: 'hide', render: (r) => (r.reversed ? <span title={r.reverseReason ?? ''}><Badge tone="muted">İptal</Badge></span> : null) },
          { key: 'act', header: '', render: (r) => !r.reversed && !r.check && <Button variant="ghost" className={`${small} text-red-700 hover:bg-red-50`} onClick={() => setReversing(r)}>İptal et</Button> },
        ]}
      />
      {reversing && (
        <ReasonDialog
          title="Hareketi iptal et"
          text={reversing.transfer ? 'Virmanın iki tarafı birlikte iptal edilir.' : 'Kayıt silinmez; iptal olarak işaretlenir ve bakiyelerden düşer.'}
          label="İptal et"
          run={(reason) => reverseMovementAction({ id: reversing.id, reason })}
          onClose={() => setReversing(null)}
          onDone={() => { setReversing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

export type CheckRow = { id: string; version: number; direction: string; partyId: string; partyName: string; checkNo: string; bank: string; date: string; due: string; amount: string; currency: Currency; status: string; note: string; endorsedTo: string | null };

export function ChecksTable({ rows, accounts, today }: { rows: CheckRow[]; accounts: AccountOption[]; today: string }) {
  const router = useRouter();
  const [act, setAct] = useState<{ kind: 'settle' | 'endorse' | 'return'; row: CheckRow } | null>(null);
  const done = () => { setAct(null); router.refresh(); };
  const label = (r: CheckRow) => `${r.partyName} · ${r.bank} ${r.checkNo}`;
  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Bu görünümde çek yok."
        columns={[
          { key: 'due', header: 'Vade', render: (r) => <span className={r.due < today && (r.status === 'portfolio' || r.status === 'issued') ? 'font-semibold text-red-700' : ''}><DateText value={r.due} /></span>, sortValue: (r) => r.due },
          { key: 'party', header: 'Cari', mobile: 'title', render: (r) => <span className="block"><Link href={`/muhasebe/cariler/${r.partyId}`} className="font-medium text-stone-900 hover:underline">{r.partyName}</Link>{r.endorsedTo && <span className="block text-xs text-stone-500">ciro: {r.endorsedTo}</span>}</span>, sortValue: (r) => r.partyName },
          { key: 'dir', header: 'Yön', render: (r) => <Badge tone={r.direction === 'received' ? 'info' : 'warning'} dot={false}>{r.direction === 'received' ? 'Alınan' : 'Verilen'}</Badge> },
          { key: 'no', header: 'Banka / no', render: (r) => <span className="whitespace-nowrap">{r.bank} <span className="font-mono text-xs text-stone-500">{r.checkNo}</span></span> },
          { key: 'amount', header: 'Tutar', align: 'right', render: (r) => <strong><Money value={money(r.amount, r.currency)} /></strong>, sortValue: (r) => BigInt(r.amount) },
          { key: 'status', header: 'Durum', render: (r) => <Badge tone={CHECK_TONES[r.status]}>{CHECK_LABELS[r.status] ?? r.status}</Badge> },
          {
            key: 'act', header: '',
            render: (r) => (
              <span className="flex justify-end gap-1 whitespace-nowrap">
                {r.status === 'portfolio' && <Button variant="secondary" className={small} onClick={() => setAct({ kind: 'settle', row: r })}>Tahsil et</Button>}
                {r.status === 'portfolio' && <Button variant="ghost" className={small} onClick={() => setAct({ kind: 'endorse', row: r })}>Ciro et</Button>}
                {r.status === 'issued' && <Button variant="secondary" className={small} onClick={() => setAct({ kind: 'settle', row: r })}>Ödendi</Button>}
                {(r.status === 'portfolio' || r.status === 'issued') && <Button variant="ghost" className={`${small} text-red-700 hover:bg-red-50`} onClick={() => setAct({ kind: 'return', row: r })}>{r.status === 'portfolio' ? 'İade / karşılıksız' : 'Geri alındı'}</Button>}
              </span>
            ),
          },
        ]}
      />
      {act?.kind === 'settle' && <SettleCheckDialog check={{ ...act.row, label: label(act.row) }} accounts={accounts} onClose={() => setAct(null)} onDone={done} />}
      {act?.kind === 'endorse' && <EndorseCheckDialog check={{ ...act.row, label: label(act.row) }} onClose={() => setAct(null)} onDone={done} />}
      {act?.kind === 'return' && (
        <ReasonDialog
          title={act.row.direction === 'received' ? 'Çek iade / karşılıksız' : 'Verilen çek geri alındı'}
          text={`${label(act.row)}. Carideki çek kaydı iptal edilir; borç/alacak geri gelir.`}
          label="Kaydet"
          run={(reason) => returnCheckAction({ id: act.row.id, version: act.row.version, reason })}
          onClose={() => setAct(null)}
          onDone={done}
        />
      )}
    </>
  );
}
