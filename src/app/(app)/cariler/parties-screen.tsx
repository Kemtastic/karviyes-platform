'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/button';
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Cariler</h1>
        <div className="flex gap-2">
          <a href="/api/disa-aktar/cariler" className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">Excel&apos;e aktar</a>
          <Button variant="secondary" onClick={() => setImporting(true)}>Excel&apos;den aktar</Button>
          <Button onClick={() => setCreating(true)}>Yeni cari</Button>
        </div>
      </div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/cariler?q=${encodeURIComponent(q)}`);
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ünvan, yetkili, vergi no veya il ile ara" aria-label="Cari ara" className={fieldClass} />
        <Button variant="secondary">Ara</Button>
      </form>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={initialQuery ? 'Aramaya uyan cari yok.' : 'Henüz cari yok. "Yeni cari" ile ilk müşterinizi ekleyin.'}
        onRowClick={(r) => router.push(`/cariler/${r.id}`)}
        columns={[
          { key: 'name', header: 'Ünvan', render: (r) => r.name, sortValue: (r) => r.name },
          { key: 'kind', header: 'Tür', render: (r) => KIND[r.kind] ?? r.kind },
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
