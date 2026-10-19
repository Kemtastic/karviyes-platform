'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { createRecurringAction, postRecurringAction, setRecurringActiveAction } from './actions';
import type { AccountOption } from './dialogs';

type Row = {
  id: string; name: string; direction: 'in' | 'out'; accountName: string; category: string; dayOfMonth: number; vatRate: string; amount: string;
  startMonth: string; endMonth: string | null; lastPostedMonth: string | null; active: boolean; version: number;
  next: { month: string; date: string; due: boolean } | null;
};

const CATEGORIES = ['Kira', 'Elektrik, su, doğalgaz', 'Personel', 'Yakıt ve ulaşım', 'Kargo ve nakliye', 'Bakım ve onarım', 'Vergi ve harç', 'Banka masrafı', 'Ofis ve kırtasiye', 'Yemek', 'Diğer'];
const monthText = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

// Tekrarlayan kayıtlar: vadesi gelen ay "İşle" ile masraf/gelir olarak kaydedilir; aylar sırayla ve bir kez işlenir.
export function RecurringTable({ rows, accounts, today }: { rows: Row[]; accounts: AccountOption[]; today: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const post = useAction(postRecurringAction);
  const toggle = useAction(setRecurringActiveAction);
  const error = post.error || toggle.error;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus aria-hidden className="h-4 w-4" /> Yeni tekrarlayan kayıt</Button></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Kayıt</th><th className="px-4 py-3 font-semibold">Hesap</th><th className="px-4 py-3 text-right font-semibold">Tutar (KDV dahil)</th>
              <th className="px-4 py-3 font-semibold">Her ay</th><th className="px-4 py-3 font-semibold">Sıradaki</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'text-stone-400'}>
                <td className="px-4 py-3"><span className="font-medium text-stone-900">{r.name}</span><span className="block text-xs text-stone-500">{r.direction === 'out' ? 'Masraf' : 'Gelir'} · {r.category} · KDV %{r.vatRate}</span></td>
                <td className="px-4 py-3">{r.accountName}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{r.amount}</td>
                <td className="px-4 py-3 tabular-nums">{r.dayOfMonth}. gün{r.endMonth && <span className="block text-xs text-stone-500">{monthText(r.endMonth)} sonuna kadar</span>}</td>
                <td className="px-4 py-3">
                  {!r.active ? <Badge tone="muted">Pasif</Badge> : r.next ? (
                    <span className="flex flex-col gap-1">
                      <span>{monthText(r.next.month)}</span>
                      <Badge tone={r.next.due ? 'warning' : 'neutral'}>{r.next.due ? 'Vadesi geldi' : `${r.next.date.split('-').reverse().join('.')} tarihinde`}</Badge>
                    </span>
                  ) : <Badge tone="muted">Bitti</Badge>}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex gap-2">
                    {r.active && r.next?.due && (
                      <Button disabled={post.pending} onClick={() => post.run({ id: r.id, month: r.next!.month, version: r.version }, () => router.refresh())}>
                        {monthText(r.next.month)} işle
                      </Button>
                    )}
                    <Button variant="secondary" disabled={toggle.pending} onClick={() => toggle.run({ id: r.id, version: r.version, active: !r.active }, () => router.refresh())}>
                      {r.active ? 'Durdur' : 'Etkinleştir'}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-500">Henüz tekrarlayan kayıt yok. Kira, aidat, abonelik gibi her ay aynı tutarla ödenen kalemleri buraya ekleyin.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <CreateDialog accounts={accounts} today={today} onClose={() => setCreating(false)} onDone={() => { setCreating(false); router.refresh(); }} />}
    </div>
  );
}

function CreateDialog({ accounts, today, onClose, onDone }: { accounts: AccountOption[]; today: string; onClose: () => void; onDone: () => void }) {
  const save = useAction(createRecurringAction);
  const f = save.fieldErrors;
  return (
    <Modal open title="Yeni tekrarlayan kayıt" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run({ ...Object.fromEntries(new FormData(e.currentTarget)) }, onDone); }}>
        <FormField label="Adı" required error={f.name} hint="örn. Depo kirası, internet aboneliği"><input name="name" className={fieldClass} autoFocus /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tür" error={f.direction}><select name="direction" className={fieldClass}><option value="out">Masraf (çıkış)</option><option value="in">Gelir (giriş)</option></select></FormField>
          <FormField label="Kategori" required error={f.category}><select name="category" className={fieldClass}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></FormField>
          <FormField label="Hesap" required error={f.accountId}><select name="accountId" className={fieldClass}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></FormField>
          <FormField label="Tutar (KDV dahil)" required error={f.amount}><input name="amount" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="KDV oranı" error={f.vatRate}><select name="vatRate" defaultValue="20" className={fieldClass}>{['0', '1', '10', '20'].map((r) => <option key={r} value={r}>%{r}</option>)}</select></FormField>
          <FormField label="Ayın günü" required error={f.dayOfMonth} hint="1–28"><input name="dayOfMonth" type="number" min={1} max={28} defaultValue={1} className={fieldClass} /></FormField>
          <FormField label="İlk ay" required error={f.startMonth}><input name="startMonth" type="month" defaultValue={today.slice(0, 7)} className={fieldClass} /></FormField>
          <FormField label="Son ay" error={f.endMonth} hint="Boşsa süresiz"><input name="endMonth" type="month" className={fieldClass} /></FormField>
        </div>
        {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={save.pending}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}
