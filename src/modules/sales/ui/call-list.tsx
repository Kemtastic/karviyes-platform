'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Phone } from 'lucide-react';
import { istanbulToday } from '@/core/dates';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { useAction } from '@/ui/use-action';
import { Modal } from '@/ui/modal';
import { FormField, fieldClass } from '@/ui/form-field';
import { setPriorityAction, transferCustomersAction } from './actions';
import { CallDialog } from './call-dialog';

type Row = {
  partyId: string; partyName: string; phone: string; contactName: string; lastAt: string | null; lastNote: string;
  nextDate: string | null; callCount: number; responsibleStaffId: string | null; responsibleName: string | null; priority: 'A' | 'B' | 'C';
};

const PRIORITY_LABEL = { A: 'A · önemli', B: 'B · normal', C: 'C · düşük' } as const;

const VIEWS = [['today', 'Bugün'], ['overdue', 'Geciken'], ['planned', 'Planlanan'], ['all', 'Tümü']] as const;

type Filters = { oncelik: string; eski: string; q: string };
type Props = { rows: Row[]; view: string; staff: { id: string; name: string }[]; responsible: string; counts: Record<string, number>; filters: Filters; isAdmin: boolean };

export function CallList({ rows, view, staff, responsible, counts, filters, isAdmin }: Props) {
  const router = useRouter();
  const [calling, setCalling] = useState<{ id: string; name: string } | null>(null);
  const [transferring, setTransferring] = useState(false);
  const prio = useAction(setPriorityAction);
  const href = (v: string, r = responsible, f: Partial<Filters> = {}) => {
    const p = new URLSearchParams({ gorunum: v });
    if (r) p.set('sorumlu', r);
    for (const [k, val] of Object.entries({ ...filters, ...f })) if (val) p.set(k, val);
    return `/satis?${p}`;
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Satış takibi"
        description="Aranacak müşteriler: son görüşme notu ve sonraki arama tarihi. Görüşmeyi kaydedince müşteri ilgili listeye geçer."
        actions={
          <label className="flex items-center gap-2 text-sm font-medium text-stone-600">
            Sorumlu
            <select value={responsible} onChange={(e) => router.push(href(view, e.target.value))} className={`${fieldClass} w-auto min-w-40 py-2`}>
              <option value="">Hepsi</option>
              <option value="yok">Sorumlusu yok</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        }
      />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); router.push(href(view, responsible, { q: String(d.get('q') ?? ''), oncelik: String(d.get('oncelik') ?? ''), eski: String(d.get('eski') ?? '') })); }}
      >
        <label className="text-sm font-medium text-stone-600">Ara<input name="q" defaultValue={filters.q} placeholder="Müşteri adı" className={`${fieldClass} mt-1 w-56 py-2`} /></label>
        <label className="text-sm font-medium text-stone-600">Öncelik
          <select name="oncelik" defaultValue={filters.oncelik} className={`${fieldClass} mt-1 w-auto py-2`}><option value="">Hepsi</option>{(['A', 'B', 'C'] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-stone-600">Uzun süredir aranmayan
          <select name="eski" defaultValue={filters.eski} className={`${fieldClass} mt-1 w-auto py-2`}><option value="">—</option>{['30', '60', '90', '180'].map((d) => <option key={d} value={d}>{d} günden fazla</option>)}</select>
        </label>
        <Button variant="secondary" className="min-h-10">Süz</Button>
        {isAdmin && <Button type="button" variant="secondary" className="ml-auto min-h-10" onClick={() => setTransferring(true)}>Müşterileri aktar</Button>}
      </form>
      {prio.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{prio.error}</p>}
      <LinkTabs label="Liste" items={VIEWS.map(([v, label]) => ({ href: href(v), label, active: view === v, count: v === 'all' ? undefined : counts[v] }))} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.partyId}
        empty={view === 'all' ? 'Henüz müşteri yok.' : 'Bu listede müşteri yok.'}
        columns={[
          {
            key: 'party', header: 'Müşteri', sortValue: (r) => r.partyName,
            render: (r) => (
              <span className="block">
                <Link href={`/cariler/${r.partyId}`} className="font-medium text-stone-900 underline-offset-2 hover:underline">{r.partyName}</Link>
                {r.contactName && <span className="block text-xs text-stone-500">{r.contactName}</span>}
              </span>
            ),
          },
          { key: 'phone', header: 'Telefon', render: (r) => (r.phone ? <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 whitespace-nowrap text-stone-700 hover:text-stone-900"><Phone aria-hidden className="h-3.5 w-3.5 text-stone-400" />{r.phone}</a> : '—') },
          {
            key: 'last', header: 'Son görüşme', sortValue: (r) => r.lastAt ?? '',
            render: (r) => (r.lastAt ? <span><DateText value={r.lastAt.slice(0, 10)} /><span className="block max-w-xs truncate text-xs text-stone-500">{r.lastNote}</span></span> : <span className="text-stone-500">Aranmadı</span>),
          },
          { key: 'next', header: 'Sonraki', render: (r) => <NextDate value={r.nextDate} />, sortValue: (r) => r.nextDate ?? '' },
          {
            key: 'prio', header: 'Öncelik', sortValue: (r) => r.priority,
            render: (r) => (
              <select aria-label={`${r.partyName} önceliği`} value={r.priority} disabled={prio.pending} onChange={(e) => prio.run({ partyId: r.partyId, priority: e.target.value }, () => router.refresh())} className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm">
                {(['A', 'B', 'C'] as const).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ),
          },
          { key: 'owner', header: 'Sorumlu', render: (r) => r.responsibleName ?? '—', sortValue: (r) => r.responsibleName ?? '' },
          { key: 'count', header: 'Görüşme', align: 'right', render: (r) => r.callCount, sortValue: (r) => r.callCount },
          { key: 'act', header: '', render: (r) => <Button variant="secondary" className="min-h-9 whitespace-nowrap" onClick={() => setCalling({ id: r.partyId, name: r.partyName })}>Görüşme ekle</Button> },
        ]}
      />
      {transferring && <TransferDialog staff={staff} onClose={() => setTransferring(false)} onDone={() => { setTransferring(false); router.refresh(); }} />}
      {calling && <CallDialog party={calling} onClose={() => setCalling(null)} onDone={() => { setCalling(null); router.refresh(); }} />}
    </div>
  );
}

// Sonraki arama: gecikmiş kırmızı, bugün amber, ileri tarih sade.
function NextDate({ value }: { value: string | null }) {
  if (!value) return <span className="text-stone-400">—</span>;
  const today = istanbulToday();
  const tone = value < today ? 'danger' : value === today ? 'warning' : 'neutral';
  return <Badge tone={tone} dot={tone !== 'neutral'}><DateText value={value} />{value === today ? ' · bugün' : value < today ? ' · gecikti' : ''}</Badge>;
}

// Ayrılan ya da bölge değiştiren satışçının bütün müşterileri tek seferde başka satışçıya geçer.
function TransferDialog({ staff, onClose, onDone }: { staff: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const save = useAction(transferCustomersAction);
  const [moved, setMoved] = useState<number | null>(null);
  return (
    <Modal open title="Müşterileri aktar" onClose={moved === null ? onClose : onDone}>
      {moved !== null ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-emerald-800">{moved} müşteri aktarıldı.</p>
          <div className="flex justify-end"><Button onClick={onDone}>Tamam</Button></div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); save.run({ fromStaffId: d.get('fromStaffId'), toStaffId: d.get('toStaffId') }, (r) => setMoved(r.moved)); }}>
          <FormField label="Kimden" required error={save.fieldErrors.fromStaffId}><select name="fromStaffId" className={fieldClass}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
          <FormField label="Kime" required error={save.fieldErrors.toStaffId}><select name="toStaffId" defaultValue={staff[1]?.id} className={fieldClass}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
          <p className="text-sm text-stone-500">Seçilen satışçının sorumlu olduğu bütün müşteriler yeni satışçıya geçer; görüşme geçmişi değişmez. İşlem denetim kaydına yazılır.</p>
          {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
            <Button disabled={save.pending}>Aktar</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
