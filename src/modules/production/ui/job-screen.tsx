'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDateTime, istanbulToday } from '@/core/dates';
import type { Role } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { DateText } from '@/ui/date-text';
import { FormField, fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { approveAction, cancelJobAction, reserveFabricAction, returnFromReviewAction, sendToStageAction, shipAction, toRepairAction, toTurningAction } from './actions';
import { EVENT_LABELS, stageLabel } from './labels';
import { StageWork } from './stage-work';

type Job = {
  id: string; no: string; orderId: string; stage: string; stageStatus: string; fabricReserved: boolean; producedQty: number; shippedQty: number; reviewNote: string;
  cancelReason: string | null; version: number; partyName: string; orderDate: string; quantity: number; productText: string; canTurn: boolean; firstStages: string[];
  packaging: { type: string; capacity: number; packages: number }; departmentNotes: Record<string, string>;
  events: { id: string; stage: string; kind: string; at: string; machine: string; data: Record<string, unknown>; note: string; staff: string[] }[];
  shipments: { id: string; qty: number; shippedAt: string; note: string }[];
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-stone-500">{job.no}</p>
          <h1 className="text-2xl font-semibold">{job.partyName}</h1>
          <p className="text-stone-700">{job.productText}</p>
          <p className="mt-1 text-lg font-semibold">
            {stageLabel(sector, job.stage)}
            {job.stageStatus === 'in_progress' && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-sm text-blue-800">işlemde</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/is-emri/${job.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">İş emri PDF</a>
          {canManage && !closed && <Button variant="danger" onClick={() => setCancelling(true)}>İşi iptal et</Button>}
        </div>
      </header>

      <section className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-4">
        <Info label="Hedef adet" value={job.quantity.toLocaleString('tr-TR')} />
        <Info label="Üretilen" value={job.producedQty.toLocaleString('tr-TR')} />
        <Info label="Sevk edilen" value={job.shippedQty.toLocaleString('tr-TR')} />
        <Info label="Sipariş tarihi" value={<DateText value={job.orderDate} />} />
      </section>

      {Object.entries(job.departmentNotes).map(([k, v]) => (
        <p key={k} className="rounded-xl bg-yellow-100 p-4 text-lg font-medium text-yellow-950">
          <span className="block text-sm font-semibold uppercase tracking-wide">{stageLabel(sector, k)} notu</span>
          {v}
        </p>
      ))}
      {job.reviewNote && job.stage !== 'review' && <p className="rounded-xl bg-orange-100 p-4">Kontrol notu: {job.reviewNote}</p>}
      {job.cancelReason && <p className="rounded-xl bg-red-50 p-4 text-red-800">İptal nedeni: {job.cancelReason}</p>}

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        {job.stage === 'waiting' && canManage && !job.fabricReserved && <ReserveFabric job={job} fabric={fabric} onDone={refresh} />}
        {job.stage === 'waiting' && canManage && job.fabricReserved && <SendToStage job={job} sector={sector} onDone={refresh} />}
        {def && canWork && <StageWork job={job} sector={sector} staff={staff} onDone={refresh} />}
        {job.stage === 'finishing' && canWork && job.stageStatus === 'waiting' && <FinishingExtras job={job} onDone={refresh} />}
        {job.stage === 'review' && canManage && <Review job={job} sector={sector} onDone={refresh} />}
        {job.stage === 'completed' && canManage && <Ship job={job} onDone={refresh} />}
        {!canManage && !canWork && <p className="text-stone-600">Bu iş şu an {stageLabel(sector, job.stage)} aşamasında.</p>}
        {closed && job.stage !== 'completed' && <p className="text-stone-600">{stageLabel(sector, job.stage)}.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Geçmiş</h2>
        <ol className="space-y-2">
          {job.events.map((e) => (
            <li key={e.id} className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
              <span className="font-medium">{EVENT_LABELS[e.kind] ?? e.kind}</span> · {stageLabel(sector, e.stage)} · {formatDateTime(new Date(e.at))}
              {e.machine && <> · {e.machine}</>}
              {e.staff.length > 0 && <> · {e.staff.join(', ')}</>}
              {Object.keys(e.data).length > 0 && <span className="block text-stone-600">{Object.entries(e.data).filter(([, v]) => v !== 0 && v !== false).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span>}
              {e.note && <span className="block text-stone-600">Not: {e.note}</span>}
            </li>
          ))}
        </ol>
      </section>

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
    <div>
      <p className="text-sm text-stone-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ReserveFabric({ job, fabric, onDone }: { job: Job; fabric: { id: string; label: string }[]; onDone: () => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const reserve = useAction(reserveFabricAction);
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Kumaş ayır</h2>
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
      <h2 className="font-semibold">Bölüme gönder</h2>
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
      <h2 className="font-semibold">Kontrol</h2>
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
      <h2 className="font-semibold">Sevk</h2>
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
