'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DEPARTMENT_ROLES, ROLE_LABELS, ROLES, type Role } from '@/core/modules/types';
import type { MemberRow } from '@/core/users/queries';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { DataTable } from '@/ui/data-table';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { createDeviceAction, deactivateMemberAction, inviteUserAction, updateRolesAction } from './actions';

export function UsersScreen({ members, currentMembershipId }: { members: MemberRow[]; currentMembershipId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'invite' | 'device' | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const deactivate = useAction(deactivateMemberAction);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Kullanıcılar</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMode('device')}>Bölüm tableti ekle</Button>
          <Button onClick={() => setMode('invite')}>Kullanıcı davet et</Button>
        </div>
      </div>
      {deactivate.error && <p role="alert" className="text-red-700">{deactivate.error}</p>}
      <DataTable
        rows={members}
        rowKey={(m) => m.id}
        columns={[
          { key: 'name', header: 'Ad', render: (m) => m.name, sortValue: (m) => m.name },
          { key: 'email', header: 'Giriş', render: (m) => <span className="font-mono text-xs">{m.email}</span> },
          { key: 'roles', header: 'Roller', render: (m) => m.roles.map((r) => ROLE_LABELS[r]).join(', ') },
          { key: 'kind', header: 'Tür', render: (m) => (m.kind === 'device' ? 'Bölüm tableti' : 'Kişi') },
          { key: '2fa', header: '2FA', render: (m) => (m.kind === 'device' ? '—' : m.twoFactorEnabled ? 'Açık' : 'Kapalı') },
          { key: 'status', header: 'Durum', render: (m) => (m.active ? 'Aktif' : <span className="text-stone-500">Pasif</span>) },
          {
            key: 'actions',
            header: '',
            render: (m) =>
              m.active && (
                <span className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditing(m)}>Rolleri düzenle</Button>
                  {m.id !== currentMembershipId && <Button variant="danger" onClick={() => setRemoving(m)}>Pasifleştir</Button>}
                </span>
              ),
          },
        ]}
      />

      <InviteModal open={mode === 'invite'} onClose={() => setMode(null)} onDone={() => router.refresh()} />
      <DeviceModal open={mode === 'device'} onClose={() => setMode(null)} onDone={() => router.refresh()} />
      {editing && <RolesModal member={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); router.refresh(); }} />}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Kullanıcı pasifleştirilsin mi?"
        message={`${removing?.name ?? ''} artık giriş yapamayacak. Kayıtları ve geçmişi korunur.`}
        confirmLabel="Pasifleştir"
        tone="danger"
        busy={deactivate.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => deactivate.run({ membershipId: removing!.id }, () => { setRemoving(null); router.refresh(); })}
      />
    </div>
  );
}

function RoleChecks({ value, onChange, allowed }: { value: Role[]; onChange: (r: Role[]) => void; allowed: readonly Role[] }) {
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="mb-1 text-sm font-medium">Roller</legend>
      {allowed.map((r) => (
        <label key={r} className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-3">
          <input type="checkbox" className="h-5 w-5" checked={value.includes(r)} onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />
          {ROLE_LABELS[r]}
        </label>
      ))}
    </fieldset>
  );
}

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [roles, setRoles] = useState<Role[]>(['sales']);
  const [link, setLink] = useState('');
  const invite = useAction(inviteUserAction);
  return (
    <Modal open={open} title="Kullanıcı davet et" onClose={() => { setLink(''); onClose(); }}>
      {link ? (
        <div className="space-y-3">
          <p>Davet e-postası gönderildi. E-posta ulaşmazsa bu bağlantıyı kişiye iletin (72 saat geçerli, tek kullanımlık):</p>
          <input readOnly value={link} className={`${fieldClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={() => { setLink(''); onClose(); }}>Tamam</Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            invite.run({ email: f.get('email'), name: f.get('name'), roles }, (d) => { setLink(d.link); onDone(); });
          }}
        >
          <FormField label="Ad soyad" required error={invite.fieldErrors.name}><input name="name" className={fieldClass} /></FormField>
          <FormField label="E-posta" required error={invite.fieldErrors.email}><input name="email" type="email" className={fieldClass} /></FormField>
          <RoleChecks value={roles} onChange={setRoles} allowed={ROLES} />
          {invite.error && <p role="alert" className="text-sm text-red-700">{invite.error}</p>}
          <Button disabled={invite.pending}>Davet gönder</Button>
        </form>
      )}
    </Modal>
  );
}

function DeviceModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [created, setCreated] = useState('');
  const device = useAction(createDeviceAction);
  return (
    <Modal open={open} title="Bölüm tableti ekle" onClose={() => { setCreated(''); onClose(); }}>
      {created ? (
        <div className="space-y-3">
          <p>Tablette bu giriş adı ve belirlediğiniz parolayla giriş yapın:</p>
          <p className="rounded-lg bg-stone-100 p-3 font-mono">{created}</p>
          <Button onClick={() => { setCreated(''); onClose(); }}>Tamam</Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            device.run({ label: f.get('label'), roles: [f.get('role')], password: f.get('password') }, (d) => { setCreated(d.loginEmail); onDone(); });
          }}
        >
          <FormField label="Tablet adı" hint="Örn. Baskı tableti" required error={device.fieldErrors.label}><input name="label" className={fieldClass} /></FormField>
          <FormField label="Bölüm" required>
            <select name="role" className={fieldClass} defaultValue="printing">
              {DEPARTMENT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </FormField>
          <FormField label="Parola" hint="En az 12 karakter" required error={device.fieldErrors.password}><input name="password" type="password" autoComplete="new-password" className={fieldClass} /></FormField>
          {device.error && <p role="alert" className="text-sm text-red-700">{device.error}</p>}
          <Button disabled={device.pending}>Oluştur</Button>
        </form>
      )}
    </Modal>
  );
}

function RolesModal({ member, onClose, onDone }: { member: MemberRow; onClose: () => void; onDone: () => void }) {
  const [roles, setRoles] = useState<Role[]>(member.roles);
  const update = useAction(updateRolesAction);
  return (
    <Modal open title={`${member.name} — roller`} onClose={onClose} dirty={roles.join() !== member.roles.join()}>
      <div className="space-y-3">
        <RoleChecks value={roles} onChange={setRoles} allowed={member.kind === 'device' ? DEPARTMENT_ROLES : ROLES} />
        {update.error && <p role="alert" className="text-sm text-red-700">{update.error}</p>}
        <Button disabled={update.pending} onClick={() => update.run({ membershipId: member.id, roles, version: member.version }, onDone)}>Kaydet</Button>
      </div>
    </Modal>
  );
}
