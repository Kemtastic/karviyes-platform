'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { updateCompanySettingsAction } from '../../actions';

type Props = {
  company: { id: string; status: string; config: { modules: string[]; sector: string; twoFactorRequiredRoles: string[]; features: Record<string, boolean> } };
  modules: { id: string; name: string; dependsOn: string[] }[];
  sectors: { id: string; name: string }[];
  roles: { id: string; label: string }[];
  features: { key: string; module: string; label: string; hint: string; default: boolean }[];
};

const chip = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium transition-colors hover:border-stone-400 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-softer)]';

// Firma ayarları: modüller (bağımlılıklarıyla), sektör, iki adımlı doğrulama zorunlu roller, özellik anahtarları, durum.
export function CompanySettingsForm({ company, modules, sectors, roles, features }: Props) {
  const router = useRouter();
  const save = useAction(updateCompanySettingsAction);
  const [mods, setMods] = useState(company.config.modules);
  const [twoFactor, setTwoFactor] = useState(company.config.twoFactorRequiredRoles);
  const [feats, setFeats] = useState<Record<string, boolean>>(() => Object.fromEntries(features.map((f) => [f.key, company.config.features[f.key] ?? f.default])));
  const [status, setStatus] = useState(company.status);
  const [saved, setSaved] = useState(false);
  const f = save.fieldErrors;

  // Açılan modülün bağımlılıkları da açılır; kapatılan modüle bağlı olanlar da kapanır.
  const toggleModule = (id: string, on: boolean) =>
    setMods((cur) => {
      if (on) return [...new Set([...cur, id, ...(modules.find((m) => m.id === id)?.dependsOn ?? [])])];
      return cur.filter((m) => m !== id && !modules.find((x) => x.id === m)?.dependsOn.includes(id));
    });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        setSaved(false);
        save.run({ companyId: company.id, modules: mods, sector: d.sector, twoFactorRoles: twoFactor, features: feats, status, reason: d.reason ?? '' }, () => { setSaved(true); router.refresh(); });
      }}
    >
      <section className="space-y-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-[15px] font-semibold">Modüller</h2>
        <p className="text-sm text-stone-600">Kapatılan modülün verisi silinmez; yalnız menüden ve işlemlerden kalkar. Yeniden açınca kaldığı yerden devam eder.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <label key={m.id} className={chip}>
              <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={mods.includes(m.id)} onChange={(e) => toggleModule(m.id, e.target.checked)} />
              <span>{m.name}{m.dependsOn.length > 0 && <span className="block text-xs font-normal text-stone-500">{m.dependsOn.map((d) => modules.find((x) => x.id === d)?.name).join(', ')} gerekir</span>}</span>
            </label>
          ))}
        </div>
        {f.modules && <p role="alert" className="text-sm text-red-700">{f.modules}</p>}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold">Sektör</h2>
          <FormField label="Sektör paketi" error={f.sector} hint="Firmada sipariş varken değiştirilemez.">
            <select name="sector" defaultValue={company.config.sector} className={fieldClass}>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </FormField>
          <h2 className="pt-2 text-[15px] font-semibold">Durum</h2>
          <div role="radiogroup" aria-label="Firma durumu" className="grid grid-cols-2 gap-2">
            {(['active', 'suspended'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={`min-h-11 rounded-xl border text-sm font-medium ${status === s ? (s === 'active' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-red-500 bg-red-50 text-red-900') : 'border-stone-300 bg-white'}`}>
                {s === 'active' ? 'Aktif' : 'Askıya al'}
              </button>
            ))}
          </div>
          {status === 'suspended' && <FormField label="Neden" required error={f.reason} hint="Askıdaki firmanın kullanıcıları giriş yapamaz; veri silinmez."><input name="reason" className={fieldClass} /></FormField>}
        </div>
        <div className="space-y-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold">İki adımlı doğrulama zorunlu roller</h2>
          <div className="grid grid-cols-2 gap-2">
            {roles.map((r) => (
              <label key={r.id} className={chip}>
                <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={twoFactor.includes(r.id)} onChange={(e) => setTwoFactor((cur) => (e.target.checked ? [...cur, r.id] : cur.filter((x) => x !== r.id)))} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-[15px] font-semibold">Özellik anahtarları</h2>
        <ul className="divide-y divide-stone-100">
          {features.map((ft) => (
            <li key={ft.key} className="flex items-center justify-between gap-4 py-3">
              <span>
                <span className="block font-medium">{ft.label}</span>
                <span className="block text-sm text-stone-500">{ft.hint}{!mods.includes(ft.module) && ' (modülü kapalı)'}</span>
              </span>
              <input type="checkbox" role="switch" aria-label={ft.label} className="h-6 w-11 accent-[var(--brand)]" checked={feats[ft.key] ?? ft.default} onChange={(e) => setFeats((cur) => ({ ...cur, [ft.key]: e.target.checked }))} />
            </li>
          ))}
        </ul>
      </section>

      {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
      <div className="flex items-center gap-3">
        <Button disabled={save.pending}>{save.pending ? 'Kaydediliyor…' : 'Ayarları kaydet'}</Button>
        {saved && <span role="status" className="text-sm font-medium text-emerald-700">Kaydedildi; firma bir sonraki sayfada yeni ayarları görür.</span>}
      </div>
    </form>
  );
}
