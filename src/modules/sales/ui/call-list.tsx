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
    <div className="space-y-5">
      <PageHeader
        title="Satış takibi"
        description="Aranacak müşteriler: son görüşme notu ve sonraki arama tarihi. Görüşmeyi kaydedince müşteri ilgili listeye geçer."
        actions={
          <label className="flex items-center gap-2 text-sm font-medium text-stone-600">
            Sorumlu
            <select value={responsible} onChange={(e) => router.push(href(view, e.target.value))} className={`${fieldClass} w-auto min-w-40 py-2`}>
              <option value="">Hepsi</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        }
      />
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
          { key: 'owner', header: 'Sorumlu', render: (r) => r.responsibleName ?? '—', sortValue: (r) => r.responsibleName ?? '' },
          { key: 'count', header: 'Görüşme', align: 'right', render: (r) => r.callCount, sortValue: (r) => r.callCount },
          { key: 'act', header: '', render: (r) => <Button variant="secondary" className="min-h-9 whitespace-nowrap" onClick={() => setCalling({ id: r.partyId, name: r.partyName })}>Görüşme ekle</Button> },
        ]}
      />
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
