'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PROVINCES, districtsOf, taxOfficesOf } from '@/core/parties/locations';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { archivePartyAction, createPartyAction, updatePartyAction } from './actions';

type Party = {
  id: string; version: number; kind: string; name: string; legalType: string; taxId: string; taxOffice: string; city: string; district: string;
  address: string; contactName: string; phone: string; email: string; notes: string;
};

export function PartyForm({ party, canArchive, onSaved }: { party: Party | null; canArchive: boolean; onSaved?: (id: string) => void }) {
  const router = useRouter();
  const [city, setCity] = useState(party?.city ?? '');
  const [legalType, setLegalType] = useState(party?.legalType ?? 'company');
  const [saved, setSaved] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const create = useAction(createPartyAction);
  const update = useAction(updatePartyAction);
  const archive = useAction(archivePartyAction);
  const action = party ? update : create;
  const fe = action.fieldErrors;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setSaved(false);
    if (party) update.run({ ...f, id: party.id, version: party.version }, () => { setSaved(true); router.refresh(); });
    else create.run(f, (row) => onSaved?.(row.id));
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Ünvan / ad soyad" required error={fe.name}><input name="name" defaultValue={party?.name} className={fieldClass} /></FormField>
        <FormField label="Tür" required>
          <select name="kind" defaultValue={party?.kind ?? 'customer'} className={fieldClass}>
            <option value="customer">Müşteri</option>
            <option value="supplier">Tedarikçi</option>
            <option value="both">Müşteri + Tedarikçi</option>
          </select>
        </FormField>
        <FormField label="Kişi türü">
          <select name="legalType" value={legalType} onChange={(e) => setLegalType(e.target.value)} className={fieldClass}>
            <option value="company">Tüzel kişi (VKN)</option>
            <option value="individual">Şahıs (TCKN)</option>
          </select>
        </FormField>
        <FormField label={legalType === 'company' ? 'Vergi no (10 hane)' : 'T.C. kimlik no (11 hane)'} error={fe.taxId}>
          <input name="taxId" inputMode="numeric" maxLength={legalType === 'company' ? 10 : 11} defaultValue={party?.taxId} className={fieldClass} />
        </FormField>
        <FormField label="İl">
          <select name="city" value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass}>
            <option value="">Seçin</option>
            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="İlçe" error={fe.district}>
          <select key={city} name="district" defaultValue={party?.city === city ? party.district : ''} disabled={!city} className={fieldClass}>
            <option value="">Seçin</option>
            {districtsOf(city).map((d) => <option key={d}>{d}</option>)}
          </select>
        </FormField>
        <FormField label="Vergi dairesi">
          <select key={`vd-${city}`} name="taxOffice" defaultValue={party?.city === city ? party.taxOffice : ''} disabled={!city} className={fieldClass}>
            <option value="">Seçin</option>
            {taxOfficesOf(city).map((d) => <option key={d}>{d}</option>)}
          </select>
        </FormField>
        <FormField label="Yetkili"><input name="contactName" defaultValue={party?.contactName} className={fieldClass} /></FormField>
        <FormField label="Telefon"><input name="phone" type="tel" defaultValue={party?.phone} className={fieldClass} /></FormField>
        <FormField label="E-posta" error={fe.email}><input name="email" type="email" defaultValue={party?.email} className={fieldClass} /></FormField>
      </div>
      <FormField label="Adres"><textarea name="address" rows={2} defaultValue={party?.address} className={fieldClass} /></FormField>
      <FormField label="Notlar"><textarea name="notes" rows={2} defaultValue={party?.notes} className={fieldClass} /></FormField>
      {action.error && <p role="alert" className="text-sm text-red-700">{action.error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Kaydedildi.</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button disabled={action.pending}>{party ? 'Kaydet' : 'Cariyi oluştur'}</Button>
        {party && canArchive && <Button type="button" variant="danger" onClick={() => setArchiving(true)}>Arşivle</Button>}
      </div>
      {party && (
        <ConfirmDialog
          open={archiving}
          title="Cari arşivlensin mi?"
          message="Arşivlenen cari listelerde görünmez; geçmiş siparişleri ve kayıtları korunur."
          confirmLabel="Arşivle"
          tone="danger"
          busy={archive.pending}
          onCancel={() => setArchiving(false)}
          onConfirm={() => archive.run({ id: party.id, version: party.version }, () => router.push('/cariler'))}
        />
      )}
    </form>
  );
}
