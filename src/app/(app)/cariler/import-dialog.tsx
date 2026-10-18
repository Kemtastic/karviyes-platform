'use client';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { importPartiesAction } from './actions';

type Result = {
  total: number; toAdd: number; added: number;
  skipped: { row: number; name: string; reason: string }[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
};

// Excel'den cari aktarımı: dosya CSV (UTF-8) olarak kaydedilir; önce önizleme, sonra içe aktarma.
export function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const run = useAction(importPartiesAction);

  async function pick(file: File | undefined) {
    setPreview(null);
    setDone(null);
    if (!file) return;
    setFileName(file.name);
    // Excel'in "CSV UTF-8"i UTF-8'dir; Türkçe Windows'taki düz "CSV" ise Windows-1254. Önce UTF-8 denenir.
    const bytes = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1254').decode(bytes);
    }
    setCsv(text);
    run.run({ csv: text, dryRun: true }, (r) => setPreview(r));
  }

  const shown = done ?? preview;
  return (
    <Modal open title="Excel'den cari aktar" onClose={done ? onDone : onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-stone-700">
          Excel&apos;de dosyayı <strong>Farklı Kaydet → CSV UTF-8</strong> olarak kaydedin. Başlık satırında en az <strong>Ad</strong> (veya “Firma adı”) olmalı; Yetkili, Telefon, İl, İlçe, VKN/TCKN, Vergi dairesi, Adres, E-posta, Tür sütunları tanınır. Aynı VKN veya aynı adla kayıtlı cariler eklenmez.
        </p>
        <label className="block">
          <span className="text-sm font-medium">Dosya</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} className="mt-1 block w-full text-sm" />
        </label>
        {run.pending && <p role="status">İnceleniyor…</p>}
        {run.error && <p role="alert" className="text-red-700">{run.error}</p>}
        {shown && (
          <div className="space-y-3" role="status">
            <p className="text-lg">
              {done ? <><strong>{done.added}</strong> cari eklendi.</> : <><strong>{shown.toAdd}</strong> cari eklenecek</>} · {shown.skipped.length} atlanacak · {shown.errors.length} hatalı satır · toplam {shown.total} satır ({fileName})
            </p>
            <Issues title="Atlananlar" items={shown.skipped.map((s) => ({ row: s.row, text: `${s.name}: ${s.reason}` }))} />
            <Issues title="Hatalı satırlar (eklenmez)" items={shown.errors.map((e) => ({ row: e.row, text: e.message }))} tone="error" />
            <Issues title="Uyarılar (eklenir, alan boşaltıldı)" items={shown.warnings.map((w) => ({ row: w.row, text: w.message }))} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          {done ? (
            <Button onClick={onDone}>Tamam</Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
              <Button disabled={!preview || !preview.toAdd || run.pending} onClick={() => run.run({ csv, dryRun: false }, (r) => setDone(r))}>
                {preview ? `${preview.toAdd} cariyi içe aktar` : 'İçe aktar'}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Issues({ title, items, tone }: { title: string; items: { row: number; text: string }[]; tone?: 'error' }) {
  if (!items.length) return null;
  return (
    <details open={tone === 'error'} className="rounded-lg border border-stone-200 p-3">
      <summary className="cursor-pointer font-medium">{title} ({items.length})</summary>
      <ul className={`mt-2 max-h-48 space-y-1 overflow-auto text-sm ${tone === 'error' ? 'text-red-800' : 'text-stone-700'}`}>
        {items.map((i, n) => <li key={n}>Satır {i.row}: {i.text}</li>)}
      </ul>
    </details>
  );
}
