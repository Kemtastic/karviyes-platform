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
        <div className="flex flex-wrap gap-2">
          {QUICK.map(([label, days]) => (
            <Button key={label} type="button" variant="secondary" onClick={() => setNextDate(addDays(days))}>{label}</Button>
          ))}
          <Button type="button" variant="ghost" onClick={() => setNextDate('')}>Takip yok</Button>
        </div>
        {log.error && <p role="alert" className="text-red-700">{log.error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={log.pending}>{log.pending ? 'Kaydediliyor…' : 'Görüşmeyi kaydet'}</Button>
        </div>
      </form>
    </Modal>
  );
}
