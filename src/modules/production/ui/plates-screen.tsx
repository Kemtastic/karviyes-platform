'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Stamp } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { PageHeader } from '@/ui/page-header';
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
    <div className="space-y-5">
      <PageHeader
        title="Klişeler"
        description="Müşterilere ait baskı klişeleri ve pozeler. Sipariş satırına bağlanan klişe iş kartında ve baskı bölümünde görünür."
        actions={<Button onClick={() => setAdding(true)}><Plus aria-hidden className="h-4 w-4" /> Klişe ekle</Button>}
      />
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <article key={p.id} className="group overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="grid h-40 place-items-center border-b border-stone-100 bg-[repeating-linear-gradient(45deg,#fafaf9_0,#fafaf9_10px,#f5f5f4_10px,#f5f5f4_20px)]">
                {p.fileIds[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- kendi dosya uç noktamız
                  <img src={`/api/files/${p.fileIds[0]}`} alt={`${p.name} klişe görseli`} className="h-full w-full object-contain p-3" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-stone-400 shadow-sm"><Stamp aria-hidden className="h-6 w-6" /></span>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-stone-900">{p.name}</h2>
                  <p className="text-sm text-stone-500">{p.partyName}</p>
                </div>
                {p.colours && (
                  <p className="flex flex-wrap gap-1">
                    {p.colours.split(/[,+/·]/).map((c) => c.trim()).filter(Boolean).map((c) => <Badge key={c} tone="neutral" dot={false}>{c}</Badge>)}
                  </p>
                )}
                {p.notes && <p className="text-sm text-stone-600">{p.notes}</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Henüz klişe yok." hint="Müşterinin logosu ya da baskı görseli için ilk klişeyi ekleyin." action={<Button variant="secondary" onClick={() => setAdding(true)}>İlk klişeyi ekle</Button>} />
      )}
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
            <span className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)] px-3 py-2.5"><strong className="font-medium">{party.name}</strong><button type="button" className="text-sm font-medium text-[var(--brand-strong)] hover:underline" onClick={() => setParty(null)}>Değiştir</button></span>
          ) : (
            <input className={fieldClass} placeholder="Müşteri ara" onChange={async (e) => { const r = await searchCustomersAction({ q: e.target.value }); setResults(r.ok ? r.data : []); }} />
          )}
        </FormField>
        {!party && results.length > 0 && (
          <ul className="max-h-48 divide-y divide-stone-100 overflow-auto rounded-xl border border-stone-200 shadow-sm">{results.map((r) => <li key={r.id}><button type="button" className="w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--brand-softer)]" onClick={() => setParty(r)}>{r.name}</button></li>)}</ul>
        )}
        <FormField label="Klişe adı" required error={create.fieldErrors.name}><input name="name" className={fieldClass} /></FormField>
        <FormField label="Baskı renkleri"><input name="colours" className={fieldClass} /></FormField>
        <FormField label="Not"><input name="notes" className={fieldClass} /></FormField>
        <FormField label="Görsel" hint="PNG, JPEG, WEBP veya PDF" error={uploadError}>
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} className={fieldClass} />
        </FormField>
        {create.error && <p role="alert" className="text-sm text-red-700">{create.error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={create.pending}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}
