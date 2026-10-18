'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { searchCustomersAction } from '@/modules/orders/ui/actions';
import { createPlateAction } from './actions';

type Plate = { id: string; name: string; colours: string; notes: string; fileIds: string[]; partyName: string };

export function PlatesScreen({ rows }: { rows: Plate[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Klişeler</h1>
        <Button onClick={() => setAdding(true)}>Klişe ekle</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <article key={p.id} className="space-y-2 rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5">
            {p.fileIds[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- kendi dosya uç noktamız
              <img src={`/api/files/${p.fileIds[0]}`} alt={`${p.name} klişe görseli`} className="h-40 w-full rounded-lg bg-stone-100 object-contain" />
            )}
            <h2 className="text-[15px] font-semibold text-stone-900">{p.name}</h2>
            <p className="text-sm text-stone-600">{p.partyName}</p>
            {p.colours && <p className="text-sm">Renkler: {p.colours}</p>}
            {p.notes && <p className="text-sm text-stone-600">{p.notes}</p>}
          </article>
        ))}
        {!rows.length && <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500 sm:col-span-3">Henüz klişe yok.</p>}
      </div>
      {adding && <PlateModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); router.refresh(); }} />}
    </div>
  );
}

function PlateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const create = useAction(createPlateAction);
  const [party, setParty] = useState<{ id: string; name: string } | null>(null);
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [fileId, setFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');

  async function upload(file: File) {
    const body = new FormData();
    body.append('file', file);
    const r = (await (await fetch('/api/files', { method: 'POST', body })).json()) as { ok: boolean; data?: { id: string }; message?: string };
    if (r.ok && r.data) setFileId(r.data.id);
    else setUploadError(r.message ?? 'Yüklenemedi.');
  }

  return (
    <Modal open title="Klişe ekle" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); create.run({ partyId: party?.id ?? '', name: f.name, colours: f.colours, notes: f.notes, fileIds: fileId ? [fileId] : [] }, onDone); }}>
        <FormField label="Müşteri" required error={create.fieldErrors.partyId}>
          {party ? (
            <span className="flex justify-between rounded-lg border border-stone-300 px-3 py-2.5"><strong>{party.name}</strong><button type="button" className="underline" onClick={() => setParty(null)}>Değiştir</button></span>
          ) : (
            <input className={fieldClass} placeholder="Müşteri ara" onChange={async (e) => { const r = await searchCustomersAction({ q: e.target.value }); setResults(r.ok ? r.data : []); }} />
          )}
        </FormField>
        {!party && results.length > 0 && (
          <ul className="max-h-48 overflow-auto rounded-lg border border-stone-200">{results.map((r) => <li key={r.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-stone-100" onClick={() => setParty(r)}>{r.name}</button></li>)}</ul>
        )}
        <FormField label="Klişe adı" required error={create.fieldErrors.name}><input name="name" className={fieldClass} /></FormField>
        <FormField label="Baskı renkleri"><input name="colours" className={fieldClass} /></FormField>
        <FormField label="Not"><input name="notes" className={fieldClass} /></FormField>
        <FormField label="Görsel" hint="PNG, JPEG, WEBP veya PDF" error={uploadError}>
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} className={fieldClass} />
        </FormField>
        {create.error && <p role="alert" className="text-sm text-red-700">{create.error}</p>}
        <Button disabled={create.pending}>Kaydet</Button>
      </form>
    </Modal>
  );
}
