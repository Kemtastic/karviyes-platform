'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { fieldClass } from '@/ui/form-field';
import { CallDialog } from './call-dialog';

type Row = {
  partyId: string; partyName: string; phone: string; contactName: string; lastAt: string | null; lastNote: string;
  nextDate: string | null; callCount: number; responsibleStaffId: string | null; responsibleName: string | null;
};

const VIEWS = [['today', 'Bugün'], ['overdue', 'Geciken'], ['planned', 'Planlanan'], ['all', 'Tümü']] as const;

type Props = { rows: Row[]; view: string; staff: { id: string; name: string }[]; responsible: string; counts: Record<string, number> };

export function CallList({ rows, view, staff, responsible, counts }: Props) {
  const router = useRouter();
  const [calling, setCalling] = useState<{ id: string; name: string } | null>(null);
  const href = (v: string, r = responsible) => `/satis?gorunum=${v}${r ? `&sorumlu=${r}` : ''}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Satış takibi</h1>
        <label className="flex items-center gap-2 text-sm">
          Sorumlu
          <select value={responsible} onChange={(e) => router.push(href(view, e.target.value))} className={`${fieldClass} w-auto`}>
            <option value="">Hepsi</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <nav aria-label="Liste" className="flex flex-wrap gap-2">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={href(v)} aria-current={view === v ? 'page' : undefined} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:border-stone-300 hover:text-stone-900 aria-[current=page]:border-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white">
            {label}{v !== 'all' && counts[v] ? ` (${counts[v]})` : ''}
          </Link>
        ))}
      </nav>
      <DataTable
        rows={rows}
        rowKey={(r) => r.partyId}
        empty={view === 'all' ? 'Henüz müşteri yok.' : 'Bu listede müşteri yok.'}
        columns={[
          { key: 'party', header: 'Müşteri', render: (r) => <Link href={`/cariler/${r.partyId}`} className="font-medium underline-offset-2 hover:underline">{r.partyName}</Link>, sortValue: (r) => r.partyName },
          { key: 'phone', header: 'Telefon', render: (r) => (r.phone ? <a href={`tel:${r.phone}`} className="underline">{r.phone}</a> : '—') },
          {
            key: 'last', header: 'Son görüşme', sortValue: (r) => r.lastAt ?? '',
            render: (r) => (r.lastAt ? <span><DateText value={r.lastAt.slice(0, 10)} /><span className="block max-w-xs truncate text-xs text-stone-500">{r.lastNote}</span></span> : <span className="text-stone-500">Aranmadı</span>),
          },
          { key: 'next', header: 'Sonraki', render: (r) => (r.nextDate ? <DateText value={r.nextDate} /> : '—'), sortValue: (r) => r.nextDate ?? '' },
          { key: 'owner', header: 'Sorumlu', render: (r) => r.responsibleName ?? '—', sortValue: (r) => r.responsibleName ?? '' },
          { key: 'count', header: 'Görüşme', align: 'right', render: (r) => r.callCount, sortValue: (r) => r.callCount },
          { key: 'act', header: '', render: (r) => <Button variant="secondary" onClick={() => setCalling({ id: r.partyId, name: r.partyName })}>Görüşme ekle</Button> },
        ]}
      />
      {calling && <CallDialog party={calling} onClose={() => setCalling(null)} onDone={() => { setCalling(null); router.refresh(); }} />}
    </div>
  );
}
