'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, type Tone } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ColourSwatch } from '@/ui/colour-swatch';
import { DataTable } from '@/ui/data-table';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { PageHeader } from '@/ui/page-header';
import { useAction } from '@/ui/use-action';
import { addFabricAction } from './actions';

type Row = { id: string; colour: string; widthCm: number; gsm: number; metres: number; status: string; jobNo: string | null; reservedFor: string | null };
type Shortage = { kind: string; label: string; widthCm: number; colour: string; gsm: number | null; required: number; available: number; missing: number; refs: string[]; canSlit: boolean };
const STATUS: Record<string, [string, Tone]> = { available: ['Stokta', 'success'], reserved: ['Ayrıldı', 'brand'], used: ['Kullanıldı', 'muted'] };

export function FabricScreen({ rows, shortages }: { rows: Row[]; shortages: Shortage[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const add = useAction(addFabricAction);
  const count = (status: string) => rows.filter((r) => r.status === status);
  const available = count('available');
  const metres = (list: Row[]) => list.reduce((s, r) => s + r.metres, 0).toLocaleString('tr-TR');
  return (
    <div className="space-y-5">
      <PageHeader
        title="Kumaş stoğu"
        description="Kumaş ve sap bobinleri. Kumaş işe elle ayrılır; sap, kesim başlarken otomatik ayrılır."
        actions={<Button onClick={() => setAdding(true)}><Plus aria-hidden className="h-4 w-4" /> Bobin ekle</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card padded><p className="text-sm text-stone-600">Stokta {available.length} bobin</p><p className="mt-1 text-2xl font-semibold tabular-nums">{metres(available)} m</p></Card>
        <Card padded><p className="text-sm text-stone-600">İşe ayrılmış</p><p className="mt-1 text-2xl font-semibold tabular-nums">{count('reserved').length} <span className="text-base font-normal text-stone-500">bobin</span></p></Card>
        <Card padded><p className="text-sm text-stone-600">Kullanılmış</p><p className="mt-1 text-2xl font-semibold tabular-nums">{count('used').length} <span className="text-base font-normal text-stone-500">bobin</span></p></Card>
      </div>

      {shortages.length > 0 && (
        <Card tone="warn" padded={false} label="Stok açığı" title={<span id="stok-acigi">Stok açığı</span>} description="Üretime alınmamış siparişler ve malzemesi ayrılmamış işler için eksik bobinler.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-amber-900/70">
                <tr>
                  <th className="px-5 py-2 font-semibold">Malzeme</th><th className="px-3 py-2 font-semibold">Renk</th><th className="px-3 py-2 text-right font-semibold">En</th>
                  <th className="px-3 py-2 text-right font-semibold">Gramaj</th><th className="px-3 py-2 text-right font-semibold">Gerekli</th><th className="px-3 py-2 text-right font-semibold">Boşta</th>
                  <th className="px-3 py-2 font-semibold">Eksik</th><th className="px-5 py-2 font-semibold">İşler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/60">
                {shortages.map((s) => (
                  <tr key={`${s.kind}|${s.colour}|${s.widthCm}|${s.gsm}`} className="text-amber-950">
                    <td className="px-5 py-2.5 font-medium">{s.label}</td>
                    <td className="px-3 py-2.5"><ColourSwatch name={s.colour} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.widthCm.toLocaleString('tr-TR')} cm</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.gsm ? `${s.gsm} gr` : 'herhangi'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.required}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.available}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone="danger">eksik {s.missing} bobin</Badge>
                      {s.canSlit && <span className="ml-2 text-xs text-amber-800">daha geniş bobinden dilimlenebilir</span>}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-amber-900">{s.refs.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Henüz bobin yok."
        columns={[
          { key: 'colour', header: 'Renk', render: (r) => <ColourSwatch name={r.colour} />, sortValue: (r) => r.colour },
          { key: 'width', header: 'En (cm)', align: 'right', render: (r) => r.widthCm.toLocaleString('tr-TR'), sortValue: (r) => r.widthCm },
          { key: 'gsm', header: 'Gramaj', align: 'right', render: (r) => r.gsm, sortValue: (r) => r.gsm },
          { key: 'metres', header: 'Metre', align: 'right', render: (r) => r.metres.toLocaleString('tr-TR'), sortValue: (r) => r.metres },
          {
            key: 'status',
            header: 'Durum',
            render: (r) => {
              const [label, tone] = STATUS[r.status] ?? [r.status, 'neutral'];
              return (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone}>{label}{r.reservedFor === 'handle' ? ' (sap)' : ''}</Badge>
                  {r.jobNo && <span className="font-mono text-xs text-stone-500">{r.jobNo}</span>}
                </span>
              );
            },
            sortValue: (r) => r.status,
          },
        ]}
      />
      <Modal open={adding} title="Bobin ekle" onClose={() => setAdding(false)}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); add.run(Object.fromEntries(new FormData(e.currentTarget)), () => { setAdding(false); router.refresh(); }); }}>
          <FormField label="Renk" required error={add.fieldErrors.colour}><input name="colour" defaultValue="Beyaz" className={fieldClass} /></FormField>
          <FormField label="En (cm)" required hint="Sap için 5" error={add.fieldErrors.widthCm}><input name="widthCm" inputMode="decimal" className={fieldClass} /></FormField>
          <FormField label="Gramaj" required error={add.fieldErrors.gsm}><input name="gsm" inputMode="numeric" defaultValue="70" className={fieldClass} /></FormField>
          <FormField label="Metre" required error={add.fieldErrors.metres}><input name="metres" inputMode="numeric" defaultValue="1000" className={fieldClass} /></FormField>
          <FormField label="Adet" error={add.fieldErrors.count}><input name="count" inputMode="numeric" defaultValue="1" className={fieldClass} /></FormField>
          {add.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{add.error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Vazgeç</Button>
            <Button disabled={add.pending}>Ekle</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
