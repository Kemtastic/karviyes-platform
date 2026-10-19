'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { createCompanyAction } from './actions';

type Props = { sectors: { id: string; name: string }[]; modules: { id: string; name: string; dependsOn: string[] }[] };

// Yeni firma: ad, kısa ad, adres, sektör, modüller ve ilk yönetici. Davet bağlantısı bir kez gösterilir.
export function NewCompany({ sectors, modules }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mods, setMods] = useState<string[]>(['orders', 'production']);
  const [done, setDone] = useState<{ inviteLink: string; mailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const save = useAction(createCompanyAction);
  const f = save.fieldErrors;
  const toggle = (id: string, on: boolean) =>
    setMods((cur) => (on ? [...new Set([...cur, id, ...(modules.find((m) => m.id === id)?.dependsOn ?? [])])] : cur.filter((m) => m !== id && !modules.find((x) => x.id === m)?.dependsOn.includes(id))));
  const close = () => { setOpen(false); setDone(null); router.refresh(); };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus aria-hidden className="h-4 w-4" /> Yeni firma</Button>
      {open && (
        <Modal open title="Yeni firma" onClose={close} wide>
          {done ? (
            <div role="status" className="space-y-3">
              <p className="font-medium text-emerald-800">Firma açıldı. {done.mailed ? 'Davet e-postayla gönderildi.' : 'E-posta gönderilemedi; bağlantıyı yöneticiye iletin.'}</p>
              <p className="break-all rounded-xl bg-stone-100 p-3 font-mono text-xs">{done.inviteLink}</p>
              <p className="text-sm text-stone-600">Bağlantı 72 saat geçerli ve bir kez gösterilir. Adres verdiyseniz DNS kaydını da ekleyin.</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(done.inviteLink); setCopied(true); }}><Copy aria-hidden className="h-4 w-4" /> {copied ? 'Kopyalandı' : 'Kopyala'}</Button>
                <Button onClick={close}>Tamam</Button>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run({ ...Object.fromEntries(new FormData(e.currentTarget)), modules: mods }, setDone); }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Firma adı" required error={f.name}><input name="name" className={fieldClass} /></FormField>
                <FormField label="Kısa ad" required error={f.slug} hint="küçük harf, rakam, tire"><input name="slug" className={`${fieldClass} font-mono`} placeholder="plastik" /></FormField>
                <FormField label="Adres" error={f.host} hint="Boşsa ana adresten açılır"><input name="host" className={`${fieldClass} font-mono`} placeholder="plastik.kemalayan.com" /></FormField>
                <FormField label="Sektör" required error={f.sector}><select name="sector" className={fieldClass}>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
                <FormField label="Yöneticinin adı" required error={f.adminName}><input name="adminName" className={fieldClass} /></FormField>
                <FormField label="Yöneticinin e-postası" required error={f.adminEmail}><input name="adminEmail" type="email" className={fieldClass} /></FormField>
                <div className="sm:col-span-2">
                  <FormField label="Ayrı veritabanı adresi" error={f.databaseUrl} hint="Boşsa ortak veritabanı. Doluysa firmanın verisi yalnız bu veritabanında durur; adres şifreli saklanır.">
                    <input name="databaseUrl" type="password" autoComplete="off" className={`${fieldClass} font-mono`} placeholder="postgres://kullanici:parola@sunucu:5432/firma" />
                  </FormField>
                </div>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-stone-700">Modüller</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {modules.map((m) => (
                    <label key={m.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-stone-300 px-3 text-sm has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-softer)]">
                      <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={mods.includes(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} /> {m.name}
                    </label>
                  ))}
                </div>
                {f.modules && <p role="alert" className="text-sm text-red-700">{f.modules}</p>}
              </fieldset>
              {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
                <Button type="button" variant="secondary" onClick={close}>Vazgeç</Button>
                <Button disabled={save.pending}>{save.pending ? 'Açılıyor…' : 'Firmayı aç'}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
