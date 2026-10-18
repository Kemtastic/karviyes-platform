'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDateTime, istanbulToday } from '@/core/dates';
import type { Role } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { Printer } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button, buttonClasses } from '@/ui/button';
import { Card } from '@/ui/card';
import { ColourSwatch } from '@/ui/colour-swatch';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { DateText } from '@/ui/date-text';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { approveAction, cancelJobAction, reserveFabricAction, returnFromReviewAction, sendToStageAction, shipAction, toRepairAction, toTurningAction } from './actions';
import { EVENT_LABELS, stageLabel, stageTone } from './labels';
import { StageWork } from './stage-work';

type Job = {
  id: string; no: string; orderId: string; stage: string; stageStatus: string; fabricReserved: boolean; producedQty: number; shippedQty: number; reviewNote: string;
  cancelReason: string | null; version: number; partyName: string; orderDate: string; quantity: number; productText: string; canTurn: boolean; firstStages: string[];
  packaging: { type: string; capacity: number; packages: number }; departmentNotes: Record<string, string>;
  events: { id: string; stage: string; kind: string; at: string; machine: string; data: Record<string, unknown>; note: string; staff: string[] }[];
  shipments: { id: string; qty: number; shippedAt: string; note: string }[];
  materials: { kind: string; label: string; widthCm: number; colour: string; gsm: number | null; rolls: number; reserved: number; used: number }[];
  plate: { id: string; name: string; colours: string; notes: string; fileIds: string[] } | null;
};

type Props = { job: Job; sector: string; canManage: boolean; fabric: { id: string; label: string }[]; staff: { id: string; name: string }[]; userRoles: Role[] };

export function JobScreen({ job, sector, canManage, fabric, staff, userRoles }: Props) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const def = getSector(sector).stages.find((s) => s.id === job.stage);
  const canWork = Boolean(def) && (canManage || userRoles.includes(def!.role));
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const cancel = useAction(cancelJobAction);
  const closed = ['completed', 'shipped', 'cancelled'].includes(job.stage);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-stone-500">{job.no}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[26px]">{job.partyName}</h1>
          <p className="mt-1 text-stone-600">{job.productText}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold">
            <Badge tone={stageTone(job.stage)}>{stageLabel(sector, job.stage)}</Badge>
            {job.stageStatus === 'in_progress' && <Badge tone="info" dot={false}>işlemde</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/is-emri/${job.id}`} className={buttonClasses('secondary')}><Printer aria-hidden className="h-4 w-4" /> İş emri PDF</a>
          {canManage && !closed && <Button variant="danger" onClick={() => setCancelling(true)}>İşi iptal et</Button>}
        </div>
      </header>

      <StagePipeline job={job} sector={sector} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Hedef adet" value={job.quantity.toLocaleString('tr-TR')} />
        <Info label="Üretilen" value={job.producedQty.toLocaleString('tr-TR')} />
        <Info label="Sevk edilen" value={job.shippedQty.toLocaleString('tr-TR')} />
        <Info label="Sipariş tarihi" value={<DateText value={job.orderDate} />} />
      </section>

      {Object.entries(job.departmentNotes).map(([k, v]) => (
        <p key={k} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-lg font-medium text-amber-950 shadow-[var(--shadow-card)]">
          <span className="block text-xs font-semibold uppercase tracking-wider text-amber-800">{stageLabel(sector, k)} notu</span>
          {v}
        </p>
      ))}
      {job.reviewNote && job.stage !== 'review' && <p className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950">Kontrol notu: {job.reviewNote}</p>}
      {job.cancelReason && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">İptal nedeni: {job.cancelReason}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <div className="space-y-4">
              {job.stage === 'waiting' && canManage && !job.fabricReserved && <ReserveFabric job={job} fabric={fabric} onDone={refresh} />}
              {job.stage === 'waiting' && canManage && job.fabricReserved && <SendToStage job={job} sector={sector} onDone={refresh} />}
              {def && canWork && <StageWork job={job} sector={sector} staff={staff} onDone={refresh} canOverride={canManage} />}
              {job.stage === 'finishing' && canWork && job.stageStatus === 'waiting' && <FinishingExtras job={job} onDone={refresh} />}
              {job.stage === 'review' && canManage && <Review job={job} sector={sector} onDone={refresh} />}
              {job.stage === 'completed' && canManage && <Ship job={job} onDone={refresh} />}
              {!canManage && !canWork && <p className="text-stone-600">Bu iş şu an {stageLabel(sector, job.stage)} aşamasında.</p>}
              {closed && job.stage !== 'completed' && <p className="text-stone-600">{stageLabel(sector, job.stage)}.</p>}
            </div>
          </Card>

          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-stone-900">Geçmiş</h2>
            <ol className="relative space-y-3 border-l border-stone-200 pl-5">
              {job.events.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--brand)] ring-1 ring-stone-200" />
                  <div className="rounded-xl border border-stone-200/80 bg-white p-3 text-sm shadow-[var(--shadow-card)]">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold text-stone-900">{EVENT_LABELS[e.kind] ?? e.kind}</span>
                      <span className="text-stone-500">· {stageLabel(sector, e.stage)}</span>
                      <span className="ml-auto text-xs tabular-nums text-stone-500">{formatDateTime(new Date(e.at))}</span>
                    </p>
                    {(e.machine || e.staff.length > 0) && <p className="mt-0.5 text-stone-600">{[e.machine, e.staff.join(', ')].filter(Boolean).join(' · ')}</p>}
                    {Object.keys(e.data).length > 0 && <p className="mt-0.5 text-stone-600">{eventDataText(e.data)}</p>}
                    {e.note && <p className="mt-0.5 text-stone-600">Not: {e.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-5">
          {job.plate && (
            <Card label="Klişe / poze" title={`Klişe / poze: ${job.plate.name}`} description={[job.plate.colours, job.plate.notes].filter(Boolean).join(' · ') || undefined}>
              {job.plate.fileIds.length > 0 ? (
                <div className="grid gap-3">
                  {job.plate.fileIds.map((id) => (
                    <a key={id} href={`/api/files/${id}`} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- yetkili dosya ucu; optimizasyon sunucusundan geçmemeli */}
                      <img src={`/api/files/${id}`} alt={`${job.plate!.name} görseli`} className="max-h-56 w-full rounded-xl border border-stone-200 bg-stone-50 object-contain" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">Görsel eklenmemiş.</p>
              )}
            </Card>
          )}

          {job.materials.length > 0 && (
            <Card label="Malzeme" title="Malzeme">
              <ul className="space-y-3">
                {job.materials.map((m) => (
                  <li key={m.kind} className="rounded-xl bg-stone-50 p-3 text-sm">
                    <p className="flex items-center justify-between gap-2">
                      <strong>{m.label}</strong>
                      <Badge tone={m.used >= m.rolls ? 'success' : m.reserved + m.used >= m.rolls ? 'brand' : 'warning'} dot={false}>ayrıldı {m.reserved} · kullanıldı {m.used}</Badge>
                    </p>
                    <p className="mt-1 text-stone-600">
                      {m.rolls} bobin {m.widthCm.toLocaleString('tr-TR')} cm <ColourSwatch name={m.colour} /> {m.gsm ? `${m.gsm} gr` : '(herhangi gramaj)'}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelling}
        title="İş iptal edilsin mi?"
        message={
          <div className="space-y-2">
            <p>Sipariş de iptal edilir, ayrılan kumaş serbest kalır.</p>
            <FormField label="İptal nedeni" required error={cancel.fieldErrors.reason}><input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={fieldClass} /></FormField>
            {cancel.error && <p role="alert" className="text-sm text-red-700">{cancel.error}</p>}
          </div>
        }
        confirmLabel="İptal et"
        tone="danger"
        busy={cancel.pending}
        onCancel={() => setCancelling(false)}
        onConfirm={() => cancel.run({ jobId: job.id, version: job.version, reason: cancelReason }, () => { setCancelling(false); refresh(); })}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-stone-900">{value}</p>
    </div>
  );
}

// Olay verisindeki alan adları (good, cutWaste…) kullanıcıya Türkçe gösterilir.
const DATA_LABELS: Record<string, string> = {
  good: 'sağlam', cutWaste: 'kesim firesi', printWaste: 'baskı firesi (m)', metres: 'metre', sacks: 'çuval', boxes: 'koli', samples: 'numune',
  rolls: 'bobin', qty: 'adet', to: 'hedef', quantityAcknowledged: 'düşük adet onaylandı', materialsSkipped: 'malzeme ayırmadan başlatıldı',
};

function eventDataText(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, v]) => v !== 0 && v !== false && v !== '')
    .map(([k, v]) => (v === true ? DATA_LABELS[k] ?? k : `${DATA_LABELS[k] ?? k}: ${typeof v === 'number' ? v.toLocaleString('tr-TR') : String(v)}`))
    .join(' · ');
}

// Aşama şeridi: geçilen aşamalar dolu, bulunulan vurgulu. Baskı yalnızca baskılı işte gösterilir.
function StagePipeline({ job, sector }: { job: Job; sector: string }) {
  const production = getSector(sector).stages.map((x) => x.id).filter((id) => id !== 'repair' && id !== 'turning' && (id !== 'printing' || job.firstStages.includes('printing')));
  const steps = ['waiting', ...production, 'review', 'completed', 'shipped'];
  const current = job.stage === 'repair' || job.stage === 'turning' ? steps.indexOf('finishing') : steps.indexOf(job.stage);
  if (job.stage === 'cancelled') return null;
  return (
    <ol aria-label="Aşamalar" className="flex gap-1 overflow-x-auto rounded-2xl border border-stone-200/80 bg-white p-2 shadow-[var(--shadow-card)]">
      {steps.map((id, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li
            key={id}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex min-w-24 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${state === 'current' ? 'bg-[var(--brand)] text-white shadow-sm' : state === 'done' ? 'bg-[var(--brand-softer)] text-[var(--brand-strong)]' : 'text-stone-400'}`}
          >
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${state === 'current' ? 'bg-white/25' : state === 'done' ? 'bg-[var(--brand-soft)]' : 'bg-stone-100'}`}>
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className="whitespace-nowrap">{stageLabel(sector, id)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ReserveFabric({ job, fabric, onDone }: { job: Job; fabric: { id: string; label: string }[]; onDone: () => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const reserve = useAction(reserveFabricAction);
  return (
    <div className="space-y-3">
      <h2 className="text-[15px] font-semibold text-stone-900">Kumaş ayır</h2>
      {!fabric.length && <p className="text-amber-800">Stokta kullanılabilir bobin yok. Kumaş stoğundan bobin ekleyin.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {fabric.map((f) => (
          <label key={f.id} className="flex min-h-12 items-center gap-3 rounded-lg border border-stone-300 px-3">
            <input type="checkbox" className="h-6 w-6" checked={ids.includes(f.id)} onChange={(e) => setIds(e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id))} />
            {f.label}
          </label>
        ))}
      </div>
      {reserve.error && <p role="alert" className="text-red-700">{reserve.error}</p>}
      <Button disabled={!ids.length || reserve.pending} onClick={() => reserve.run({ jobId: job.id, version: job.version, rollIds: ids }, onDone)}>Seçilen bobinleri ayır</Button>
    </div>
  );
}

function SendToStage({ job, sector, onDone }: { job: Job; sector: string; onDone: () => void }) {
  const send = useAction(sendToStageAction);
  return (
    <div className="space-y-3">
      <h2 className="text-[15px] font-semibold text-stone-900">Bölüme gönder</h2>
      <div className="flex flex-wrap gap-2">
        {job.firstStages.map((s) => (
          <Button key={s} disabled={send.pending} onClick={() => send.run({ jobId: job.id, version: job.version, stage: s }, onDone)}>{stageLabel(sector, s)} bölümüne gönder</Button>
        ))}
      </div>
      {send.error && <p role="alert" className="text-red-700">{send.error}</p>}
    </div>
  );
}

function FinishingExtras({ job, onDone }: { job: Job; onDone: () => void }) {
  const repair = useAction(toRepairAction);
  const turning = useAction(toTurningAction);
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-200 pt-4">
      <Button variant="secondary" disabled={repair.pending} onClick={() => repair.run({ jobId: job.id, version: job.version }, onDone)}>Tamire gönder</Button>
      {job.canTurn && <Button variant="secondary" disabled={turning.pending} onClick={() => turning.run({ jobId: job.id, version: job.version }, onDone)}>Çevirmeye gönder</Button>}
      {(repair.error || turning.error) && <p role="alert" className="text-red-700">{repair.error || turning.error}</p>}
    </div>
  );
}

function Review({ job, sector, onDone }: { job: Job; sector: string; onDone: () => void }) {
  const approve = useAction(approveAction);
  const back = useAction(returnFromReviewAction);
  const repair = useAction(toRepairAction);
  const [to, setTo] = useState('finishing');
  const [note, setNote] = useState('');
  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-semibold text-stone-900">Kontrol</h2>
      <p>Üretilen: <strong>{job.producedQty.toLocaleString('tr-TR')}</strong> / hedef {job.quantity.toLocaleString('tr-TR')}</p>
      <Button disabled={approve.pending} onClick={() => approve.run({ jobId: job.id, version: job.version }, onDone)}>Onayla — faturaya hazır</Button>
      <div className="grid gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-3">
        <FormField label="Geri gönder">
          <select value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass}>
            {getSector(sector).stages.filter((s) => s.id !== 'turning').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </FormField>
        <FormField label="Not" required error={back.fieldErrors.note}><input value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} /></FormField>
        <div className="flex items-end gap-2">
          <Button variant="secondary" disabled={back.pending} onClick={() => back.run({ jobId: job.id, version: job.version, to, note }, onDone)}>Geri gönder</Button>
          <Button variant="secondary" disabled={repair.pending} onClick={() => repair.run({ jobId: job.id, version: job.version, note }, onDone)}>Tamire</Button>
        </div>
      </div>
      {(approve.error || back.error || repair.error) && <p role="alert" className="text-red-700">{approve.error || back.error || repair.error}</p>}
    </div>
  );
}

function Ship({ job, onDone }: { job: Job; onDone: () => void }) {
  const ship = useAction(shipAction);
  const remaining = job.producedQty - job.shippedQty;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); ship.run({ jobId: job.id, version: job.version, qty: Number(f.qty), shippedAt: f.shippedAt, note: f.note }, onDone); }}>
      <h2 className="text-[15px] font-semibold text-stone-900">Sevk</h2>
      <p className="text-sm text-stone-600">Sevk edilebilir: {remaining.toLocaleString('tr-TR')} adet</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Adet" required error={ship.fieldErrors.qty}><input name="qty" inputMode="numeric" defaultValue={remaining} className={fieldClass} /></FormField>
        <FormField label="Sevk tarihi" required><input type="date" name="shippedAt" defaultValue={istanbulToday()} className={fieldClass} /></FormField>
        <FormField label="Not"><input name="note" className={fieldClass} /></FormField>
      </div>
      {ship.error && <p role="alert" className="text-red-700">{ship.error}</p>}
      <Button disabled={ship.pending}>Sevk et</Button>
      {job.shipments.length > 0 && (
        <ul className="text-sm text-stone-600">
          {job.shipments.map((s) => <li key={s.id}><DateText value={s.shippedAt} /> · {s.qty.toLocaleString('tr-TR')} adet {s.note && `· ${s.note}`}</li>)}
        </ul>
      )}
    </form>
  );
}
