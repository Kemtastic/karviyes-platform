'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { setMemberActiveAction } from '../../actions';

type Member = { membershipId: string; name: string; email: string; roles: string[]; kind: string; active: boolean; twoFactorEnabled: boolean; lastLogin: string | null };
const KIND: Record<string, string> = { person: 'Kişi', device: 'Tablet', staff: 'Personel' };

// Firmanın kullanıcıları; panel yöneticisi gerekçe yazarak kilitler ya da açar.
export function UsersTable({ companyId, members, roleLabels }: { companyId: string; members: Member[]; roleLabels: Record<string, string> }) {
  const router = useRouter();
  const [target, setTarget] = useState<Member | null>(null);
  const save = useAction(setMemberActiveAction);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : 'Hiç');
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Kullanıcı</th><th className="px-4 py-3 text-left font-semibold">Roller</th><th className="px-4 py-3 text-left font-semibold">2FA</th>
              <th className="px-4 py-3 text-left font-semibold">Son giriş</th><th className="px-4 py-3 text-left font-semibold">Durum</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {members.map((m) => (
              <tr key={m.membershipId}>
                <td className="px-4 py-2.5"><span className="font-medium text-stone-900">{m.name}</span><span className="block text-xs text-stone-500">{m.email} · {KIND[m.kind] ?? m.kind}</span></td>
                <td className="px-4 py-2.5">{m.roles.map((r) => roleLabels[r] ?? r).join(', ')}</td>
                <td className="px-4 py-2.5">{m.kind === 'device' ? '—' : <Badge tone={m.twoFactorEnabled ? 'success' : 'warning'}>{m.twoFactorEnabled ? 'Açık' : 'Kapalı'}</Badge>}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-stone-600">{fmt(m.lastLogin)}</td>
                <td className="px-4 py-2.5"><Badge tone={m.active ? 'success' : 'danger'}>{m.active ? 'Aktif' : 'Kilitli'}</Badge></td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="secondary" onClick={() => { save.clearErrors(); setTarget(m); }}>
                    {m.active ? <><Lock aria-hidden className="h-4 w-4" /> Kilitle</> : <><LockOpen aria-hidden className="h-4 w-4" /> Aç</>}
                  </Button>
                </td>
              </tr>
            ))}
            {!members.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-500">Bu firmada henüz kullanıcı yok.</td></tr>}
          </tbody>
        </table>
      </div>
      {target && (
        <Modal open title={target.active ? `${target.name} kilitlensin mi?` : `${target.name} açılsın mı?`} onClose={() => setTarget(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get('reason') ?? '');
              save.run({ companyId, membershipId: target.membershipId, active: !target.active, reason }, () => { setTarget(null); router.refresh(); });
            }}
          >
            <p className="text-sm text-stone-600">{target.active ? 'Kilitlenen kullanıcı bu firmaya giriş yapamaz; verisi silinmez.' : 'Kullanıcı yeniden giriş yapabilir.'} İşlem firmanın denetim kaydına ve panel kaydına yazılır.</p>
            <FormField label="Gerekçe" required error={save.fieldErrors.reason}><input name="reason" className={fieldClass} autoFocus /></FormField>
            {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTarget(null)}>Vazgeç</Button>
              <Button disabled={save.pending}>{target.active ? 'Kilitle' : 'Aç'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
