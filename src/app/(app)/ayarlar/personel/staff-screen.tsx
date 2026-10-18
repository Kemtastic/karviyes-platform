'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLE_LABELS, ROLES, type Role } from '@/core/modules/types';
import { Button } from '@/ui/button';
import { DataTable } from '@/ui/data-table';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { createStaffAction, updateStaffAction } from './actions';

type StaffRow = { id: string; name: string; kind: string; departments: string[]; active: boolean; version: number };

const KIND_LABELS: Record<string, string> = { master: 'Usta', collector: 'Toplayıcı', operator: 'Operatör', sales: 'Satışçı', other: 'Diğer' };

export function StaffScreen({ rows }: { rows: StaffRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<StaffRow | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Personel</h1>
        <Button onClick={() => setEditing('new')}>Personel ekle</Button>
      </div>
      <p className="text-sm text-stone-600">Personel kartları giriş yapmaz; bölüm formlarında işi yapan kişi olarak seçilir. Satışçılar siparişte satış yapan olarak seçilir.</p>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Henüz personel yok."
        onRowClick={(r) => setEditing(r)}
        columns={[
          { key: 'name', header: 'Ad', render: (r) => r.name, sortValue: (r) => r.name },
          { key: 'kind', header: 'Görev', render: (r) => KIND_LABELS[r.kind] ?? r.kind },
          { key: 'dep', header: 'Bölümler', render: (r) => r.departments.map((d) => ROLE_LABELS[d as Role] ?? d).join(', ') || '—' },
          { key: 'active', header: 'Durum', render: (r) => (r.active ? 'Aktif' : 'Pasif') },
        ]}
      />
      {editing && <StaffModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function StaffModal({ row, onClose, onDone }: { row: StaffRow | null; onClose: () => void; onDone: () => void }) {
  const [departments, setDepartments] = useState<string[]>(row?.departments ?? []);
  const create = useAction(createStaffAction);
  const update = useAction(updateStaffAction);
  const action = row ? update : create;
  return (
    <Modal open title={row ? row.name : 'Personel ekle'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const base = { name: f.get('name'), kind: f.get('kind'), departments };
          if (row) update.run({ ...base, id: row.id, version: row.version, active: f.get('active') === 'on' }, onDone);
          else create.run(base, onDone);
        }}
      >
        <FormField label="Ad soyad" required error={action.fieldErrors.name}><input name="name" defaultValue={row?.name} className={fieldClass} /></FormField>
        <FormField label="Görev" required>
          <select name="kind" defaultValue={row?.kind ?? 'operator'} className={fieldClass}>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FormField>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-sm font-medium">Bölümler</legend>
          {ROLES.filter((r) => r !== 'admin').map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-3">
              <input type="checkbox" className="h-5 w-5" checked={departments.includes(r)} onChange={(e) => setDepartments(e.target.checked ? [...departments, r] : departments.filter((d) => d !== r))} />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </fieldset>
        {row && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={row.active} className="h-5 w-5" /> Aktif
          </label>
        )}
        {action.error && <p role="alert" className="text-sm text-red-700">{action.error}</p>}
        <Button disabled={action.pending}>Kaydet</Button>
      </form>
    </Modal>
  );
}
