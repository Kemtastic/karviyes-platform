'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { updateBrandingAction } from './actions';

const PRESETS = ['#c2410c', '#b91c1c', '#be185d', '#7c3aed', '#1d4ed8', '#0369a1', '#0f766e', '#15803d', '#a16207', '#44403c'];

export function BrandingForm({ name, brandColor, logoFileId }: { name: string; brandColor: string; logoFileId: string | null }) {
  const router = useRouter();
  const [color, setColor] = useState(brandColor);
  const [logo, setLogo] = useState(logoFileId);
  const [uploadError, setUploadError] = useState('');
  const [saved, setSaved] = useState(false);
  const [previewName, setPreviewName] = useState(name);
  const save = useAction(updateBrandingAction);

  async function upload(file: File) {
    setUploadError('');
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/files', { method: 'POST', body });
    const r = (await res.json()) as { ok: boolean; data?: { id: string; contentType: string }; message?: string };
    if (!r.ok || !r.data) return setUploadError(r.message ?? 'Yüklenemedi.');
    if (!r.data.contentType.startsWith('image/')) return setUploadError('Logo için PNG, JPEG veya WEBP görsel seçin.');
    setLogo(r.data.id);
  }

  return (
    <form
      className="grid gap-5 lg:grid-cols-[1fr_280px]"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        save.run({ name: new FormData(e.currentTarget).get('name'), brandColor: color, logoFileId: logo }, () => { setSaved(true); router.refresh(); });
      }}
    >
      <div className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <FormField label="Firma adı" required error={save.fieldErrors.name}><input name="name" defaultValue={name} onChange={(e) => setPreviewName(e.target.value)} className={fieldClass} /></FormField>
      <FormField label="Ana renk" hint="Menü, düğmeler ve vurgu rengi" error={save.fieldErrors.brandColor}>
        <span className="flex items-center gap-3">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-stone-300 bg-white p-1" aria-label="Renk seçici" />
          <input value={color} onChange={(e) => setColor(e.target.value)} className={`${fieldClass} font-mono`} />
        </span>
      </FormField>
      <div role="group" aria-label="Hazır renkler" className="-mt-2 flex flex-wrap gap-2">
          {PRESETS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Renk ${c}`} className={`h-7 w-7 rounded-full ring-offset-2 transition hover:scale-110 ${color.toLowerCase() === c ? 'ring-2 ring-stone-900' : ''}`} style={{ backgroundColor: c }} />
          ))}
      </div>
      <FormField label="Logo" hint="PNG, JPEG veya WEBP; en fazla 10 MB" error={uploadError}>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} className={fieldClass} />
      </FormField>
      {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
      <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
        <Button disabled={save.pending}>{save.pending ? 'Kaydediliyor…' : 'Kaydet'}</Button>
        {saved && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Check aria-hidden className="h-4 w-4" />Kaydedildi.</p>}
      </div>
      </div>
      <aside aria-label="Önizleme" className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Önizleme</p>
        <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5 bg-stone-950 px-4 py-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- kendi dosya uç noktamız
              <img src={`/api/files/${logo}`} alt="Firma logosu önizleme" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: color }}>{previewName.slice(0, 1).toLocaleUpperCase('tr') || 'K'}</span>
            )}
            <span className="truncate text-sm font-semibold text-white">{previewName || 'Firma adı'}</span>
          </div>
          <div className="space-y-3 p-4">
            <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, white)`, color: `color-mix(in srgb, ${color} 80%, black)` }}>
              <span className="h-4 w-1 rounded-full" style={{ backgroundColor: color }} /> Seçili menü
            </span>
            <span className="inline-flex min-h-9 items-center rounded-xl px-4 text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: color }}>Yeni sipariş</span>
          </div>
        </div>
      </aside>
    </form>
  );
}
