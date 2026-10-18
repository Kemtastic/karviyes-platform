'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileDown, FileUp, Plus, Search } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button, buttonClasses } from '@/ui/button';
import { PageHeader } from '@/ui/page-header';
import { DataTable } from '@/ui/data-table';
import { fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { ImportDialog } from './import-dialog';
import { PartyForm } from './party-form';

type Row = { id: string; name: string; kind: string; city: string; district: string; contactName: string; phone: string; taxId: string };
const KIND: Record<string, string> = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'Müşteri + Tedarikçi' };

export function PartiesScreen({ rows, initialQuery }: { rows: Row[]; initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Cariler"
        description="Müşteriler ve tedarikçiler. Satıra tıklayınca cari kartı; sipariş bakiyesi ve görüşmeler açılır."
        actions={
          <>
            <a href="/api/disa-aktar/cariler" className={buttonClasses('secondary')}><FileDown aria-hidden className="h-4 w-4" /> Excel&apos;e aktar</a>
            <Button variant="secondary" onClick={() => setImporting(true)}><FileUp aria-hidden className="h-4 w-4" /> Excel&apos;den aktar</Button>
            <Button onClick={() => setCreating(true)}><Plus aria-hidden className="h-4 w-4" /> Yeni cari</Button>
          </>
        }
      />
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/cariler?q=${encodeURIComponent(q)}`);
        }}
        className="flex gap-2 rounded-2xl border border-stone-200/80 bg-white p-2 shadow-[var(--shadow-card)]"
      >
        <span className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ünvan, yetkili, vergi no veya il ile ara" aria-label="Cari ara" className={`${fieldClass} border-transparent pl-9 shadow-none hover:border-transparent`} />
        </span>
        <Button>Ara</Button>
      </form>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={initialQuery ? 'Aramaya uyan cari yok.' : 'Henüz cari yok. "Yeni cari" ile ilk müşterinizi ekleyin.'}
        onRowClick={(r) => router.push(`/cariler/${r.id}`)}
        columns={[
          {
            key: 'name', header: 'Ünvan', sortValue: (r) => r.name,
            render: (r) => (
              <span className="flex items-center gap-3">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600">{r.name.slice(0, 1).toLocaleUpperCase('tr')}</span>
                <span className="font-medium text-stone-900">{r.name}</span>
              </span>
            ),
          },
          { key: 'kind', header: 'Tür', render: (r) => <Badge tone={r.kind === 'supplier' ? 'neutral' : r.kind === 'both' ? 'info' : 'brand'} dot={false}>{KIND[r.kind] ?? r.kind}</Badge> },
          { key: 'contact', header: 'Yetkili', render: (r) => r.contactName || '—' },
          { key: 'phone', header: 'Telefon', render: (r) => r.phone || '—' },
          { key: 'place', header: 'İl / İlçe', render: (r) => [r.city, r.district].filter(Boolean).join(' / ') || '—' },
          { key: 'tax', header: 'Vergi no', render: (r) => r.taxId || '—' },
        ]}
      />
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => { setImporting(false); router.refresh(); }} />}
      <Modal open={creating} title="Yeni cari" onClose={() => setCreating(false)} wide>
        <PartyForm party={null} canArchive={false} onSaved={(id) => { setCreating(false); router.push(`/cariler/${id}`); }} />
      </Modal>
    </div>
  );
}
