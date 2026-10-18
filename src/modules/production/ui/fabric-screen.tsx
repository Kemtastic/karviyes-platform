'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { DataTable } from '@/ui/data-table';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { addFabricAction } from './actions';

type Row = { id: string; colour: string; widthCm: number; gsm: number; metres: number; status: string; jobNo: string | null; reservedFor: string | null };
type Shortage = { kind: string; label: string; widthCm: number; colour: string; gsm: number | null; required: number; available: number; missing: number; refs: string[]; canSlit: boolean };
const STATUS: Record<string, string> = { available: 'Stokta', reserved: 'Ayrıldı', used: 'Kullanıldı' };

export function FabricScreen({ rows, shortages }: { rows: Row[]; shortages: Shortage[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const add = useAction(addFabricAction);
  const available = rows.filter((r) => r.status === 'available');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kumaş stoğu</h1>
        <Button onClick={() => setAdding(true)}>Bobin ekle</Button>
      </div>
      {shortages.length > 0 && (
        <section aria-labelledby="stok-acigi" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 id="stok-acigi" className="font-semibold text-amber-950">Stok açığı</h2>
          <p className="text-sm text-amber-900">Üretime alınmamış siparişler ve malzemesi ayrılmamış işler için eksik bobinler.</p>
          <ul className="space-y-1">
            {shortages.map((s) => (
              <li key={`${s.kind}|${s.colour}|${s.widthCm}|${s.gsm}`} className="text-amber-950">
                <strong>{s.label} · {s.colour} · {s.widthCm.toLocaleString('tr-TR')} cm · {s.gsm ? `${s.gsm} gr` : 'herhangi gramaj'}</strong>: gerekli {s.required}, boşta {s.available}, <strong>eksik {s.missing}</strong> bobin
                <span className="text-sm text-amber-800"> ({s.refs.join(', ')}){s.canSlit ? ' · daha geniş bobinden dilimlenebilir' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-stone-600">Stokta {available.length} bobin · {available.reduce((s, r) => s + r.metres, 0).toLocaleString('tr-TR')} m</p>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Henüz bobin yok."
        columns={[
          { key: 'colour', header: 'Renk', render: (r) => r.colour, sortValue: (r) => r.colour },
          { key: 'width', header: 'En (cm)', align: 'right', render: (r) => r.widthCm.toLocaleString('tr-TR'), sortValue: (r) => r.widthCm },
          { key: 'gsm', header: 'Gramaj', align: 'right', render: (r) => r.gsm, sortValue: (r) => r.gsm },
          { key: 'metres', header: 'Metre', align: 'right', render: (r) => r.metres.toLocaleString('tr-TR'), sortValue: (r) => r.metres },
          { key: 'status', header: 'Durum', render: (r) => `${STATUS[r.status] ?? r.status}${r.jobNo ? ` · ${r.jobNo}` : ''}${r.reservedFor === 'handle' ? ' (sap)' : ''}`, sortValue: (r) => r.status },
        ]}
      />
      <Modal open={adding} title="Bobin ekle" onClose={() => setAdding(false)}>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); add.run(Object.fromEntries(new FormData(e.currentTarget)), () => { setAdding(false); router.refresh(); }); }}>
          <FormField label="Renk" required error={add.fieldErrors.colour}><input name="colour" defaultValue="Beyaz" className={fieldClass} /></FormField>
          <FormField label="En (cm)" required error={add.fieldErrors.widthCm}><input name="widthCm" inputMode="decimal" className={fieldClass} /></FormField>
          <FormField label="Gramaj" required error={add.fieldErrors.gsm}><input name="gsm" inputMode="numeric" defaultValue="70" className={fieldClass} /></FormField>
          <FormField label="Metre" required error={add.fieldErrors.metres}><input name="metres" inputMode="numeric" defaultValue="1000" className={fieldClass} /></FormField>
          <FormField label="Adet" error={add.fieldErrors.count}><input name="count" inputMode="numeric" defaultValue="1" className={fieldClass} /></FormField>
          {add.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{add.error}</p>}
          <div className="sm:col-span-2"><Button disabled={add.pending}>Ekle</Button></div>
        </form>
      </Modal>
    </div>
  );
}
