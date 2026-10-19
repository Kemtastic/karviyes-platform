'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { CompanyProfile } from '@/core/company/profile';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { updateProfileAction } from './actions';

const CARD = 'space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6';

// Resmî bilgiler: belgelerde ve mali müşavire giden yazışmalarda kullanılır.
export function ProfileForm({ profile }: { profile: CompanyProfile }) {
  const [saved, setSaved] = useState(false);
  const save = useAction(updateProfileAction);
  const f = save.fieldErrors;
  const field = (name: keyof CompanyProfile, label: string, opts: { hint?: string; mono?: boolean; type?: string; wide?: boolean } = {}) => (
    <div className={opts.wide ? 'sm:col-span-2' : undefined}>
      <FormField label={label} hint={opts.hint} error={f[name]}>
        <input name={name} type={opts.type ?? 'text'} defaultValue={String(profile[name] ?? '')} className={`${fieldClass} ${opts.mono ? 'font-mono' : ''}`} />
      </FormField>
    </div>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        const { accountantName, accountantEmail, accountantPhone, ...rest } = d;
        save.run({ ...rest, accountant: { name: accountantName, email: accountantEmail, phone: accountantPhone } }, () => setSaved(true));
      }}
    >
      <section className={CARD}>
        <h2 className="text-[15px] font-semibold text-stone-900">Resmî bilgiler</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('legalName', 'Ticari unvan', { wide: true, hint: 'Faturada ve belgelerde yazan tam unvan' })}
          {field('taxOffice', 'Vergi dairesi')}
          {field('taxNumber', 'Vergi no / T.C. kimlik no', { mono: true, hint: '10 hane (şahıs firmasında 11)' })}
          {field('mersisNo', 'MERSİS no', { mono: true, hint: '16 hane' })}
          {field('tradeRegistryNo', 'Ticaret sicil no', { mono: true })}
        </div>
      </section>
      <section className={CARD}>
        <h2 className="text-[15px] font-semibold text-stone-900">İletişim ve banka</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('address', 'Adres', { wide: true })}
          {field('city', 'İl / ilçe')}
          {field('phone', 'Telefon', { type: 'tel' })}
          {field('email', 'E-posta', { type: 'email' })}
          {field('website', 'Web sitesi')}
          {field('bank', 'Banka')}
          {field('iban', 'IBAN', { mono: true, hint: 'Belgelerde gösterilen ana hesap' })}
        </div>
      </section>
      <section className={CARD}>
        <h2 className="text-[15px] font-semibold text-stone-900">Mali müşavir</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Adı" error={f['accountant.name']}><input name="accountantName" defaultValue={profile.accountant.name} className={fieldClass} /></FormField>
          <FormField label="E-posta" error={f['accountant.email']}><input name="accountantEmail" type="email" defaultValue={profile.accountant.email} className={fieldClass} /></FormField>
          <FormField label="Telefon" error={f['accountant.phone']}><input name="accountantPhone" type="tel" defaultValue={profile.accountant.phone} className={fieldClass} /></FormField>
        </div>
      </section>
      {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
      <div className="flex items-center gap-3">
        <Button disabled={save.pending}>{save.pending ? 'Kaydediliyor…' : 'Bilgileri kaydet'}</Button>
        {saved && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Check aria-hidden className="h-4 w-4" />Kaydedildi.</p>}
      </div>
    </form>
  );
}
