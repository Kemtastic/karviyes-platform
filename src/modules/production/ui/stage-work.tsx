'use client';
import { useRef, useState } from 'react';
import { CircleCheck, Play, Target } from 'lucide-react';
import { getSector } from '@/sectors';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { finishStageAction, startStageAction } from './actions';

const toNumber = (v: string | undefined) => (v ? Number(v.replace(',', '.')) : undefined);

type Job = { id: string; version: number; stage: string; stageStatus: string; quantity: number };

// Bir aşamayı başlatma ve bitirme formları. Tablet için büyük dokunma hedefleri.
export function StageWork({ job, sector, staff, onDone, canOverride = false }: { job: Job; sector: string; staff: { id: string; name: string }[]; onDone: () => void; canOverride?: boolean }) {
  const def = getSector(sector).stages.find((s) => s.id === job.stage);
  const start = useAction(startStageAction);
  const startForm = useRef<HTMLFormElement>(null);
  const finish = useAction(finishStageAction);
  const [people, setPeople] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  if (!def) return null;

  const staffPicker = (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-stone-700">İşi yapan</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {staff.map((s) => (
          <label key={s.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-stone-300 bg-white px-3 text-base font-medium shadow-sm transition-colors hover:border-stone-400 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-softer)] has-[:checked]:text-[var(--brand-strong)]">
            <input type="checkbox" className="h-6 w-6 accent-[var(--brand)]" checked={people.includes(s.id)} onChange={(e) => setPeople(e.target.checked ? [...people, s.id] : people.filter((x) => x !== s.id))} />
            {s.name}
          </label>
        ))}
        {!staff.length && <p className="col-span-full rounded-xl border border-dashed border-stone-300 px-3 py-4 text-sm text-stone-500">Bu bölüm için personel tanımlı değil.</p>}
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
        ref={startForm}
      >
        <FormField label="Makine"><input name="machine" placeholder="örn. Kesim 1" className={`${fieldClass} min-h-12 text-lg`} /></FormField>
        {staffPicker}
        {start.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{start.error}</p>}
        {start.error.includes('gerekli') && canOverride && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => start.run({ jobId: job.id, version: job.version, machine: startForm.current ? new FormData(startForm.current).get('machine') : '', staffIds: people, skipMaterials: true }, onDone)}
          >
            Malzeme ayırmadan başlat (kayda geçer)
          </Button>
        )}
        <div className="sticky bottom-16 z-10 -mx-1 bg-gradient-to-t from-white via-white/95 to-white/0 px-1 pb-2 pt-4 lg:bottom-0">
          <Button disabled={start.pending} className="min-h-14 w-full text-lg shadow-[var(--shadow-pop)]"><Play aria-hidden className="h-5 w-5" /> {def.label}: İşe başla</Button>
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
      <p className="inline-flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600"><Target aria-hidden className="h-4 w-4" />Hedef: <strong className="tabular-nums text-stone-900">{job.quantity.toLocaleString('tr-TR')} adet</strong></p>
      <div className="grid gap-3 sm:grid-cols-2">
        {def.finishFields.map((x) => (
          <FormField key={x.key} label={x.unit ? `${x.label} (${x.unit})` : x.label} required={x.required} error={finish.fieldErrors[x.key === 'waste' ? 'cutWaste' : x.key]}>
            <input name={x.key} inputMode="numeric" className={`${fieldClass} min-h-12 text-lg`} />
          </FormField>
        ))}
        {job.stage === 'finishing' && <FormField label="Çuval / koli sayısı"><input name="sacks" inputMode="numeric" className={`${fieldClass} min-h-12 text-lg`} /></FormField>}
      </div>
      {finish.fieldErrors.good && (
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 text-base text-amber-900">
          <input type="checkbox" className="h-6 w-6 accent-amber-600" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Adet doğru, hedefin altında olduğunu onaylıyorum
        </label>
      )}
      {staffPicker}
      <FormField label="Not"><input name="note" className={fieldClass} /></FormField>
      {finish.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{finish.error}</p>}
      <div className="sticky bottom-16 z-10 -mx-1 bg-gradient-to-t from-white via-white/95 to-white/0 px-1 pb-2 pt-4 lg:bottom-0">
        <Button disabled={finish.pending} className="min-h-14 w-full text-lg shadow-[var(--shadow-pop)]"><CircleCheck aria-hidden className="h-5 w-5" /> {def.label}: Bitir</Button>
      </div>
    </form>
  );
}
