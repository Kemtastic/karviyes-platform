'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { startSupportViewAction } from '../../actions';

// Müşteri gözüyle bak: gerekçe, rol ve süre seçilir; firma ekranları salt okunur açılır.
export function SupportViewButton({ companyId, roles }: { companyId: string; roles: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const start = useAction(startSupportViewAction);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Eye aria-hidden className="h-4 w-4" /> Müşteri gözüyle bak</Button>
      {open && (
        <Modal open title="Müşteri gözüyle bak" onClose={() => setOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              start.run({ companyId, role: f.get('role'), minutes: Number(f.get('minutes')), reason: f.get('reason') }, () => router.push('/'));
            }}
          >
            <p className="text-sm text-stone-600">Firmanın ekranlarını seçtiğiniz rolün gözüyle, <b>salt okunur</b> görürsünüz; hiçbir kayıt değiştirilemez. Başlangıç ve bitiş firmanın denetim kaydına gerekçesiyle yazılır.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Rol" required><select name="role" className={fieldClass} defaultValue="admin">{roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></FormField>
              <FormField label="Süre" required><select name="minutes" className={fieldClass} defaultValue="30"><option value="15">15 dakika</option><option value="30">30 dakika</option><option value="60">1 saat</option></select></FormField>
            </div>
            <FormField label="Gerekçe" required error={start.fieldErrors.reason} hint="Ör. destek talebi numarası ve konu"><input name="reason" className={fieldClass} autoFocus /></FormField>
            {start.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{start.error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
              <Button disabled={start.pending}>{start.pending ? 'Açılıyor…' : 'Bakışı başlat'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
