'use client';
import { useCallback, useEffect, useState } from 'react';
import { DateText } from '@/ui/date-text';
import { queueAction } from './actions';
import { StageWork } from './stage-work';

type Item = { id: string; no: string; stage: string; stageStatus: string; version: number; reviewNote: string; productText: string; note: string; quantity: number; partyName: string; orderDate: string; packaging: { type: string; capacity: number; packages: number } };

const POLL_MS = 10_000;

export function DepartmentScreen({ stage, title, sector, initial, staff }: { stage: string; title: string; sector: string; initial: Item[]; staff: { id: string; name: string }[] }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<'waiting' | 'in_progress'>('waiting');
  const [openId, setOpenId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await queueAction({ stage });
      if (r.ok) {
        setItems(r.data);
        setOffline(false);
      }
    } catch {
      // Bağlantı kopukken modal değil üst şerit gösterilir; yeniden denenir.
      setOffline(true);
    }
  }, [stage]);

  useEffect(() => {
    const t = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  const list = items.filter((i) => i.stageStatus === tab);
  const open = items.find((i) => i.id === openId) ?? null;

  return (
    <div className="space-y-4">
      {offline && <p role="status" className="sticky top-0 z-30 rounded-lg bg-amber-100 p-3 font-medium text-amber-900">Bağlantı yok, yeniden deneniyor…</p>}
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div role="tablist" className="grid grid-cols-2 gap-2">
        {(['waiting', 'in_progress'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="min-h-14 rounded-xl border border-stone-300 text-lg font-semibold aria-selected:border-stone-900 aria-selected:bg-stone-900 aria-selected:text-white">
            {t === 'waiting' ? 'Bekleyen İşler' : 'İşlemdeki İşler'} ({items.filter((i) => i.stageStatus === t).length})
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-4">
        <ul className="space-y-3">
          {list.map((i) => (
            <li key={i.id}>
              <button onClick={() => setOpenId(i.id)} aria-current={openId === i.id ? 'true' : undefined} className="w-full rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm aria-[current=true]:border-[var(--brand)] aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--brand)]">
                <span className="flex justify-between gap-2"><strong className="text-lg">{i.partyName}</strong><span className="font-mono text-sm text-stone-500">{i.no}</span></span>
                <span className="block text-stone-700">{i.productText}</span>
                <span className="block text-sm text-stone-500">{i.quantity.toLocaleString('tr-TR')} adet · <DateText value={i.orderDate} /></span>
                {i.note && <span className="mt-2 block rounded-lg bg-yellow-100 p-2 font-medium text-yellow-950">{i.note}</span>}
              </button>
            </li>
          ))}
          {!list.length && <li className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500">İş yok.</li>}
        </ul>

        {open && (
          // Telefonda tam ekran iş kartı; geniş ekranda sağ sütun.
          <section aria-label="İş kartı" className="fixed inset-0 z-40 overflow-y-auto bg-white p-4 pb-24 lg:static lg:z-auto lg:rounded-xl lg:border lg:border-stone-200 lg:pb-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm text-stone-500">{open.no}</p>
                <h2 className="text-xl font-semibold">{open.partyName}</h2>
                <p>{open.productText}</p>
              </div>
              <button onClick={() => setOpenId(null)} className="min-h-12 rounded-lg border border-stone-300 px-4 font-medium lg:hidden">Geri</button>
            </div>
            {open.note && <p className="mb-3 rounded-xl bg-yellow-100 p-4 text-lg font-medium text-yellow-950">{open.note}</p>}
            {open.reviewNote && <p className="mb-3 rounded-xl bg-orange-100 p-3">Kontrol notu: {open.reviewNote}</p>}
            <StageWork job={{ id: open.id, version: open.version, stage: open.stage, stageStatus: open.stageStatus, quantity: open.quantity }} sector={sector} staff={staff} onDone={() => { setOpenId(null); void reload(); }} />
          </section>
        )}
      </div>
    </div>
  );
}
