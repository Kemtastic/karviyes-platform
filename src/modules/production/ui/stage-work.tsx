'use client';
import { useState } from 'react';
import { getSector } from '@/sectors';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { finishStageAction, startStageAction } from './actions';

const toNumber = (v: string | undefined) => (v ? Number(v.replace(',', '.')) : undefined);

type Job = { id: string; version: number; stage: string; stageStatus: string; quantity: number };

// Bir aşamayı başlatma ve bitirme formları. Tablet için büyük dokunma hedefleri.
export function StageWork({ job, sector, staff, onDone }: { job: Job; sector: string; staff: { id: string; name: string }[]; onDone: () => void }) {
  const def = getSector(sector).stages.find((s) => s.id === job.stage);
  const start = useAction(startStageAction);
  const finish = useAction(finishStageAction);
  const [people, setPeople] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  if (!def) return null;

  const staffPicker = (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">İşi yapan</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {staff.map((s) => (
          <label key={s.id} className="flex min-h-12 items-center gap-3 rounded-lg border border-stone-300 px-3 text-base">
            <input type="checkbox" className="h-7 w-7" checked={people.includes(s.id)} onChange={(e) => setPeople(e.target.checked ? [...people, s.id] : people.filter((x) => x !== s.id))} />
            {s.name}
          </label>
        ))}
        {!staff.length && <p className="text-sm text-stone-500">Bu bölüm için personel tanımlı değil.</p>}
      </div>
    </fieldset>
  );

  if (job.stageStatus === 'waiting') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start.run({ jobId: job.id, version: job.version, machine: new FormData(e.currentTarget).get('machine'), staffIds: people }, onDone);
        }}
      >
        <FormField label="Makine"><input name="machine" placeholder="örn. Kesim 1" className={`${fieldClass} min-h-12 text-lg`} /></FormField>
        {staffPicker}
        {start.error && <p role="alert" className="text-red-700">{start.error}</p>}
        <div className="sticky bottom-16 z-10 bg-white/95 py-2 lg:bottom-0">
          <Button disabled={start.pending} className="min-h-14 w-full text-lg">{def.label}: İşe başla</Button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        const nums = Object.fromEntries(def.finishFields.map((x) => [x.key === 'waste' ? 'cutWaste' : x.key, toNumber(f[x.key])]));
        finish.run({ jobId: job.id, version: job.version, ...nums, sacks: f.sacks ? Number(f.sacks) : 0, staffIds: people, note: f.note, quantityAcknowledged: ack }, onDone);
      }}
    >
      <p className="text-sm text-stone-600">Hedef: <strong>{job.quantity.toLocaleString('tr-TR')} adet</strong></p>
      <div className="grid gap-3 sm:grid-cols-2">
        {def.finishFields.map((x) => (
          <FormField key={x.key} label={x.unit ? `${x.label} (${x.unit})` : x.label} required={x.required} error={finish.fieldErrors[x.key === 'waste' ? 'cutWaste' : x.key]}>
            <input name={x.key} inputMode="numeric" className={`${fieldClass} min-h-12 text-lg`} />
          </FormField>
        ))}
        {job.stage === 'finishing' && <FormField label="Çuval / koli sayısı"><input name="sacks" inputMode="numeric" className={`${fieldClass} min-h-12 text-lg`} /></FormField>}
      </div>
      {finish.fieldErrors.good && (
        <label className="flex min-h-12 items-center gap-3 rounded-lg bg-amber-50 px-3 text-base">
          <input type="checkbox" className="h-7 w-7" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Adet doğru, hedefin altında olduğunu onaylıyorum
        </label>
      )}
      {staffPicker}
      <FormField label="Not"><input name="note" className={fieldClass} /></FormField>
      {finish.error && <p role="alert" className="text-red-700">{finish.error}</p>}
      <div className="sticky bottom-16 z-10 bg-white/95 py-2 lg:bottom-0">
        <Button disabled={finish.pending} className="min-h-14 w-full text-lg">{def.label}: Bitir</Button>
      </div>
    </form>
  );
}
