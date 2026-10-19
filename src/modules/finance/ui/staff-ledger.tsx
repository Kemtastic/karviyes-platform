'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { recordStaffEntryAction, reverseStaffEntryAction } from './actions';
import type { AccountOption } from './dialogs';

type Balance = { staffId: string; name: string; active: boolean; balance: string; owed: boolean; advanceOver: boolean };
type Ledger = { staffId: string; name: string; balance: string; owed: boolean; rows: { id: string; date: string; kind: string; label: string; period: string | null; note: string; amount: string; reversed: boolean; balance: string }[] };

const KINDS = [
  { id: 'accrual', label: 'Tahakkuk (maaş, prim)' },
  { id: 'advance', label: 'Avans' },
  { id: 'payment', label: 'Maaş ödemesi' },
  { id: 'deduction', label: 'Kesinti' },
];
const dmy = (d: string) => d.split('-').reverse().join('.');

export function StaffLedgerScreen({ balances, ledger, accounts, today }: { balances: Balance[]; ledger: Ledger | null; accounts: AccountOption[]; today: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const reverse = useAction(reverseStaffEntryAction);
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <Button onClick={() => setAdding(true)}><Plus aria-hidden className="h-4 w-4" /> Kayıt ekle</Button>
        <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white text-sm shadow-[var(--shadow-card)]">
          {balances.map((b) => (
            <li key={b.staffId}>
              <Link href={`/muhasebe/personel?kisi=${b.staffId}`} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50 ${ledger?.staffId === b.staffId ? 'bg-[var(--brand-softer)]' : ''}`}>
                <span className={b.active ? 'font-medium text-stone-900' : 'text-stone-400'}>{b.name}</span>
                <span className="text-right tabular-nums">{b.balance}{b.advanceOver && <span className="block text-xs text-amber-700">fazla avans</span>}</span>
              </Link>
            </li>
          ))}
          {!balances.length && <li className="px-4 py-6 text-center text-stone-500">Personel kartı yok. Ayarlar → Personel ekranından ekleyin.</li>}
        </ul>
      </div>
      <section aria-label="Personel hesabı" className="space-y-3">
        {ledger ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-900">{ledger.name}</h2>
              <p className="text-sm">Bakiye: <b className="tabular-nums">{ledger.balance}</b> <span className="text-stone-500">{ledger.owed ? '(personele borçluyuz)' : ''}</span></p>
            </div>
            {reverse.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{reverse.error}</p>}
            <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="px-4 py-3 font-semibold">Tarih</th><th className="px-4 py-3 font-semibold">İşlem</th><th className="px-4 py-3 text-right font-semibold">Tutar</th><th className="px-4 py-3 text-right font-semibold">Bakiye</th><th className="px-4 py-3" /></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {ledger.rows.map((r) => (
                    <tr key={r.id} className={r.reversed ? 'text-stone-400 line-through' : ''}>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{dmy(r.date)}</td>
                      <td className="px-4 py-2.5">{r.label}{r.period && ` · ${r.period}`}{r.note && <span className="block text-xs text-stone-500">{r.note}</span>}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.amount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.balance}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.reversed ? <Badge tone="muted">İptal</Badge> : (
                          <button
                            type="button"
                            className="text-sm font-medium text-red-700 hover:underline"
                            onClick={() => { const reason = window.prompt('İptal nedeni'); if (reason) reverse.run({ id: r.id, reason }, () => router.refresh()); }}
                          >İptal et</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!ledger.rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-500">Bu kişiye ait kayıt yok.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-500">Hesabını görmek için soldan bir kişi seçin.</p>}
      </section>
      {adding && <EntryDialog balances={balances} accounts={accounts} today={today} staffId={ledger?.staffId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); router.refresh(); }} />}
    </div>
  );
}

function EntryDialog({ balances, accounts, today, staffId, onClose, onDone }: { balances: Balance[]; accounts: AccountOption[]; today: string; staffId?: string; onClose: () => void; onDone: () => void }) {
  const save = useAction(recordStaffEntryAction);
  const [kind, setKind] = useState('accrual');
  const f = save.fieldErrors;
  const paysOut = kind === 'advance' || kind === 'payment';
  return (
    <Modal open title="Personel kaydı" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run({ ...Object.fromEntries(new FormData(e.currentTarget)), kind }, onDone); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Personel" required error={f.staffId}><select name="staffId" defaultValue={staffId} className={fieldClass}>{balances.filter((b) => b.active).map((b) => <option key={b.staffId} value={b.staffId}>{b.name}</option>)}</select></FormField>
          <FormField label="İşlem" required><select value={kind} onChange={(e) => setKind(e.target.value)} className={fieldClass}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></FormField>
          <FormField label="Tutar" required error={f.amount}><input name="amount" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="Tarih" required error={f.date}><input type="date" name="date" defaultValue={today} max={today} className={fieldClass} /></FormField>
          {kind === 'accrual' && <FormField label="Dönem" required error={f.period}><input type="month" name="period" defaultValue={today.slice(0, 7)} className={fieldClass} /></FormField>}
          {paysOut && <FormField label="Ödenen hesap" required error={f.accountId}><select name="accountId" className={fieldClass}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></FormField>}
        </div>
        <FormField label="Açıklama" error={f.note}><input name="note" className={fieldClass} /></FormField>
        {paysOut && <p className="text-sm text-stone-500">Ödeme kasadan/bankadan “Personel” masrafı olarak da düşülür.</p>}
        {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={save.pending}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}
