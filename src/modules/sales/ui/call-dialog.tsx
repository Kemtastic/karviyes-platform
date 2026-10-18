'use client';
import { useState } from 'react';
import { istanbulToday } from '@/core/dates';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { logCallAction } from './actions';

function addDays(days: number): string {
  const d = new Date(`${istanbulToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const QUICK: [string, number][] = [['Yarın', 1], ['1 hafta', 7], ['2 hafta', 14], ['1 ay', 30]];

// Görüşme kaydı: not ve sonraki arama tarihi (hızlı seçimlerle).
export function CallDialog({ party, onClose, onDone }: { party: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState(addDays(7));
  const log = useAction(logCallAction);
  return (
    <Modal open title={`Görüşme: ${party.name}`} onClose={onClose} dirty={note.trim().length > 0}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          log.run({ partyId: party.id, note, nextDate: nextDate || null }, onDone);
        }}
      >
        <FormField label="Görüşme notu" required error={log.fieldErrors.note}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={fieldClass} placeholder="Ne konuşuldu, ne istendi?" />
        </FormField>
        <FormField label="Sonraki arama" hint="Boş bırakılırsa takip listesine düşmez" error={log.fieldErrors.nextDate}>
          <input type="date" min={istanbulToday()} value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={fieldClass} />
        </FormField>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map(([label, days]) => {
            const on = nextDate === addDays(days);
            return (
              <button key={label} type="button" aria-pressed={on} onClick={() => setNextDate(addDays(days))}
                className={`min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${on ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}>
                {label}
              </button>
            );
          })}
          <button type="button" aria-pressed={!nextDate} onClick={() => setNextDate('')}
            className={`min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${!nextDate ? 'border-stone-900 bg-stone-900 text-white' : 'border-dashed border-stone-300 text-stone-600 hover:bg-stone-50'}`}>
            Takip yok
          </button>
        </div>
        {log.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{log.error}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={log.pending}>{log.pending ? 'Kaydediliyor…' : 'Görüşmeyi kaydet'}</Button>
        </div>
      </form>
    </Modal>
  );
}
