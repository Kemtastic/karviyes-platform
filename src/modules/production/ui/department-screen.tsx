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
      {offline && <p role="status" className="sticky top-0 z-30 rounded-xl bg-amber-100 p-3 font-medium text-amber-900">Bağlantı yok, yeniden deneniyor…</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Bölüm ekranı</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">{title}</h1>
        </div>
        <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm ring-1 ring-stone-200">
          <span aria-hidden className={`h-2 w-2 rounded-full ${offline ? 'bg-amber-500' : 'animate-pulse bg-emerald-500'}`} />
          {offline ? 'Bağlantı bekleniyor' : 'Canlı · kendiliğinden yenilenir'}
        </p>
      </div>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200/70 p-1">
        {(['waiting', 'in_progress'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="min-h-14 rounded-xl text-base font-semibold text-stone-600 transition-colors aria-selected:bg-white aria-selected:text-stone-900 aria-selected:shadow-sm sm:text-lg">
            {t === 'waiting' ? 'Bekleyen İşler' : 'İşlemdeki İşler'} ({items.filter((i) => i.stageStatus === t).length})
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-4">
        <ul className="space-y-3">
          {list.map((i) => (
            <li key={i.id}>
              <button onClick={() => setOpenId(i.id)} aria-current={openId === i.id ? 'true' : undefined} className="w-full rounded-2xl border border-stone-200/80 bg-white p-5 text-left shadow-[var(--shadow-card)] transition hover:border-stone-300 aria-[current=true]:border-[var(--brand)] aria-[current=true]:ring-4 aria-[current=true]:ring-[var(--brand-soft)]">
                <span className="flex items-start justify-between gap-2">
                  <strong className="text-lg leading-snug">{i.partyName}</strong>
                  <span className="shrink-0 font-mono text-xs font-medium text-stone-500">{i.no}</span>
                </span>
                <span className="mt-1 block text-stone-600">{i.productText}</span>
                <span className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 font-semibold tabular-nums text-[var(--brand-strong)]">{i.quantity.toLocaleString('tr-TR')} adet</span>
                  <span className="text-stone-500">Sipariş <DateText value={i.orderDate} /></span>
                </span>
                {i.note && <span className="mt-3 block rounded-xl border border-amber-200 bg-amber-50 p-3 font-medium text-amber-950">{i.note}</span>}
              </button>
            </li>
          ))}
          {!list.length && <li className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center text-stone-500">İş yok.</li>}
        </ul>

        {open && (
          // Telefonda tam ekran iş kartı; geniş ekranda sağ sütun.
          <section aria-label="İş kartı" className="fixed inset-0 z-40 overflow-y-auto bg-white p-4 pb-24 lg:sticky lg:top-6 lg:z-auto lg:self-start lg:rounded-2xl lg:border lg:border-stone-200/80 lg:p-6 lg:shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-medium uppercase tracking-wider text-stone-500">{open.no}</p>
                <h2 className="text-xl font-semibold tracking-tight">{open.partyName}</h2>
                <p className="text-stone-600">{open.productText}</p>
              </div>
              <button onClick={() => setOpenId(null)} className="min-h-12 rounded-xl border border-stone-300 px-4 font-medium lg:hidden">Geri</button>
            </div>
            {open.note && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-lg font-medium text-amber-950">{open.note}</p>}
            {open.reviewNote && <p className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-950">Kontrol notu: {open.reviewNote}</p>}
            <StageWork job={{ id: open.id, version: open.version, stage: open.stage, stageStatus: open.stageStatus, quantity: open.quantity }} sector={sector} staff={staff} onDone={() => { setOpenId(null); void reload(); }} />
          </section>
        )}
      </div>
    </div>
  );
}
