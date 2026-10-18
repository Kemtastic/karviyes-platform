'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { DateText } from '@/ui/date-text';
import { fieldClass } from '@/ui/form-field';
import { useAction } from '@/ui/use-action';
import { setResponsibleAction } from './actions';
import { CallDialog } from './call-dialog';

type Props = {
  party: { id: string; name: string };
  calls: { id: string; at: string; note: string; nextDate: string | null; staffName: string | null }[];
  responsibleStaffId: string | null;
  staff: { id: string; name: string }[];
};

// Cari kartında satış takibi: sorumlu satışçı ve görüşme geçmişi.
export function PartyCalls({ party, calls, responsibleStaffId, staff }: Props) {
  const router = useRouter();
  const [calling, setCalling] = useState(false);
  const owner = useAction(setResponsibleAction);
  return (
    <section aria-label="Satış takibi" className="space-y-3 rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-stone-900">Satış takibi</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            Sorumlu
            <select
              value={responsibleStaffId ?? ''}
              disabled={owner.pending}
              onChange={(e) => owner.run({ partyId: party.id, staffId: e.target.value || null }, () => router.refresh())}
              className={`${fieldClass} w-auto`}
            >
              <option value="">Atanmadı</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <Button variant="secondary" onClick={() => setCalling(true)}><PhoneCall aria-hidden className="h-4 w-4" /> Görüşme ekle</Button>
        </div>
      </div>
      {owner.error && <p role="alert" className="text-red-700">{owner.error}</p>}
      {calls.length ? (
        <ol className="relative space-y-4 border-l border-stone-200 pl-5">
          {calls.map((c) => (
            <li key={c.id} className="relative">
              <span aria-hidden className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-[var(--brand)] shadow" />
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                <span className="font-medium text-stone-700"><DateText value={c.at.slice(0, 10)} /></span>
                {c.staffName && <span>· {c.staffName}</span>}
                {c.nextDate && <Badge tone="info" dot={false}>sonraki: <DateText value={c.nextDate} /></Badge>}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-stone-800">{c.note}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">Henüz görüşme kaydı yok.</p>
      )}
      {calling && <CallDialog party={party} onClose={() => setCalling(false)} onDone={() => { setCalling(false); router.refresh(); }} />}
    </section>
  );
}
