'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { updateBrandingAction } from './actions';

export function BrandingForm({ name, brandColor, logoFileId }: { name: string; brandColor: string; logoFileId: string | null }) {
  const router = useRouter();
  const [color, setColor] = useState(brandColor);
  const [logo, setLogo] = useState(logoFileId);
  const [uploadError, setUploadError] = useState('');
  const [saved, setSaved] = useState(false);
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
      className="space-y-4 rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        save.run({ name: new FormData(e.currentTarget).get('name'), brandColor: color, logoFileId: logo }, () => { setSaved(true); router.refresh(); });
      }}
    >
      <FormField label="Firma adı" required error={save.fieldErrors.name}><input name="name" defaultValue={name} className={fieldClass} /></FormField>
      <FormField label="Ana renk" hint="Menü, düğmeler ve vurgu rengi" error={save.fieldErrors.brandColor}>
        <span className="flex items-center gap-3">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-16 rounded border" aria-label="Renk seçici" />
          <input value={color} onChange={(e) => setColor(e.target.value)} className={`${fieldClass} font-mono`} />
        </span>
      </FormField>
      <FormField label="Logo" hint="PNG, JPEG veya WEBP; en fazla 10 MB" error={uploadError}>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} className={fieldClass} />
      </FormField>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element -- kendi dosya uç noktamız
        <img src={`/api/files/${logo}`} alt="Firma logosu önizleme" className="h-16 w-auto rounded border object-contain p-1" />
      )}
      {save.error && <p role="alert" className="text-sm text-red-700">{save.error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Kaydedildi.</p>}
      <Button disabled={save.pending}>Kaydet</Button>
    </form>
  );
}
