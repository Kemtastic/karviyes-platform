'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy, FileDown, Link2, Plus, Send } from 'lucide-react';
import { istanbulToday } from '@/core/dates';
import { CURRENCIES, formatMoney, money, type Currency } from '@/core/money';
import { Badge, type Tone } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { DataTable } from '@/ui/data-table';
import { DateText } from '@/ui/date-text';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { Money } from '@/ui/money';
import { useAction } from '@/ui/use-action';
import { cancelReconciliationAction, createReconciliationAction, issueReconciliationLinkAction, recordReconciliationAnswerAction } from './actions';
import { PartyPicker, ReasonDialog, type PartyRef } from './dialogs';

export const REC_LABELS: Record<string, string> = { draft: 'Taslak', pending: 'Cevap bekleniyor', agreed: 'Mutabık', disputed: 'Mutabık değil', cancelled: 'İptal' };
export const REC_TONES: Record<string, Tone> = { draft: 'neutral', pending: 'info', agreed: 'success', disputed: 'danger', cancelled: 'muted' };

type Row = { id: string; no: string; partyId: string; partyName: string; currency: Currency; asOf: string; balance: string; email: string; status: string; sentAt: string | null; respondedAt: string | null };

export function ReconciliationList({ rows, initialParty }: { rows: Row[]; initialParty: PartyRef | null }) {
  const router = useRouter();
  const [creating, setCreating] = useState(Boolean(initialParty));
  return (
    <>
      <div><Button onClick={() => setCreating(true)}><Plus aria-hidden className="h-4 w-4" /> Yeni mutabakat</Button></div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Henüz mutabakat yok."
        onRowClick={(r) => router.push(`/muhasebe/mutabakat/${r.id}`)}
        columns={[
          { key: 'no', header: 'No', render: (r) => <span className="whitespace-nowrap font-mono text-xs text-stone-700">{r.no}</span>, sortValue: (r) => r.no },
          { key: 'party', header: 'Cari', mobile: 'title', render: (r) => <span className="font-medium text-stone-900">{r.partyName}</span>, sortValue: (r) => r.partyName },
          { key: 'asOf', header: 'Tarih', render: (r) => <DateText value={r.asOf} />, sortValue: (r) => r.asOf },
          { key: 'balance', header: 'Bakiye', align: 'right', render: (r) => <Money value={money(r.balance, r.currency)} />, sortValue: (r) => BigInt(r.balance) },
          { key: 'status', header: 'Durum', render: (r) => <Badge tone={REC_TONES[r.status]}>{REC_LABELS[r.status]}</Badge> },
        ]}
      />
      {creating && <CreateDialog initialParty={initialParty} onClose={() => setCreating(false)} onDone={(id) => router.push(`/muhasebe/mutabakat/${id}`)} />}
    </>
  );
}

function CreateDialog({ initialParty, onClose, onDone }: { initialParty: PartyRef | null; onClose: () => void; onDone: (id: string) => void }) {
  const save = useAction(createReconciliationAction);
  const [party, setParty] = useState<PartyRef | null>(initialParty);
  const f = save.fieldErrors;
  const today = istanbulToday();
  return (
    <Modal open title="Yeni mutabakat" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run({ ...Object.fromEntries(new FormData(e.currentTarget)), partyId: party?.id ?? '' }, (d) => onDone(d.id)); }}>
        <PartyPicker value={party} onChange={setParty} error={f.partyId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mutabakat tarihi" required error={f.asOf} hint="Bu tarihe kadarki hareketler"><input type="date" name="asOf" defaultValue={today} max={today} className={fieldClass} /></FormField>
          <FormField label="Para birimi" required error={f.currency}><select name="currency" className={fieldClass}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></FormField>
          <FormField label="Gönderilecek e-posta" error={f.email}><input type="email" name="email" className={fieldClass} placeholder="muhasebe@firma.com" /></FormField>
          <FormField label="Yetkili" error={f.contactName}><input name="contactName" className={fieldClass} /></FormField>
        </div>
        <FormField label="Mesaj" error={f.message}><textarea name="message" rows={3} className={fieldClass} placeholder="örn. Yıl sonu kapanışı için bakiyenizi teyit etmenizi rica ederiz." /></FormField>
        {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={save.pending}>{save.pending ? 'Hazırlanıyor…' : 'Bakiyeyi dondur'}</Button>
        </div>
      </form>
    </Modal>
  );
}

type Detail = {
  id: string; no: string; version: number; partyId: string; currency: Currency; asOf: string; balance: string; email: string; contactName: string; message: string; status: string;
  sentAt: string | null; linkActive: boolean; tokenExpiresAt: string | null; cancelReason: string | null;
  response: { name: string; title: string; note: string; counterBalance: string | null; at: string; external: boolean } | null;
  snapshot: { partyName: string; rows: { date: string; text: string; debit: string; credit: string; balance: string }[]; truncated: boolean };
};

export function ReconciliationDetail({ r }: { r: Detail }) {
  const router = useRouter();
  const issue = useAction(issueReconciliationLinkAction);
  const [link, setLink] = useState<{ link: string; mailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [dialog, setDialog] = useState<'cancel' | 'answer' | null>(null);
  const fm = (v: string) => formatMoney(money(v, r.currency));
  const b = BigInt(r.balance);
  const open = r.status === 'draft' || r.status === 'pending';
  const run = (send: boolean) => issue.run({ id: r.id, version: r.version, send }, (d) => { setLink(d); setCopied(false); router.refresh(); });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500"><DateText value={r.asOf} /> itibarıyla bakiye</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{fm((b < 0n ? -b : b).toString())}</p>
          <p className="text-sm text-stone-600">{b > 0n ? 'Cari bize borçlu' : b < 0n ? 'Biz cariye borçluyuz' : 'Hesap kapalı'}</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-stone-500">E-posta</dt><dd>{r.email || '—'}</dd></div>
            <div><dt className="text-xs text-stone-500">Yetkili</dt><dd>{r.contactName || '—'}</dd></div>
            {r.sentAt && <div><dt className="text-xs text-stone-500">Son gönderim</dt><dd>{new Date(r.sentAt).toLocaleString('tr-TR')}</dd></div>}
            {r.tokenExpiresAt && r.linkActive && <div><dt className="text-xs text-stone-500">Bağlantı geçerlilik</dt><dd><DateText value={r.tokenExpiresAt.slice(0, 10)} /></dd></div>}
          </dl>
          {r.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">{r.message}</p>}
        </section>
        <section className="space-y-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
          <Badge tone={REC_TONES[r.status]}>{REC_LABELS[r.status]}</Badge>
          {open && (
            <div className="flex flex-col gap-2">
              {r.email && <Button disabled={issue.pending} onClick={() => run(true)}><Send aria-hidden className="h-4 w-4" /> {r.sentAt ? 'Yeniden gönder' : 'E-postayla gönder'}</Button>}
              <Button variant="secondary" disabled={issue.pending} onClick={() => run(false)}><Link2 aria-hidden className="h-4 w-4" /> {r.linkActive ? 'Yeni bağlantı oluştur' : 'Bağlantı oluştur'}</Button>
              <Button variant="ghost" onClick={() => setDialog('answer')}>Gelen cevabı kaydet</Button>
              <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setDialog('cancel')}>İptal et</Button>
            </div>
          )}
          <a href={`/api/pdf/mutabakat/${r.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"><FileDown aria-hidden className="h-4 w-4" /> PDF mektup</a>
          {issue.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{issue.error}</p>}
          {link && (
            <div role="status" className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
              <p className="font-medium text-sky-900">{link.mailed ? 'E-posta gönderildi.' : r.email ? 'E-posta gönderilemedi; bağlantıyı kopyalayıp iletin.' : 'Bağlantı hazır; karşı tarafa iletin.'} Eski bağlantı artık geçersiz.</p>
              <p className="break-all font-mono text-xs text-sky-900">{link.link}</p>
              <Button variant="secondary" className="min-h-9" onClick={async () => { await navigator.clipboard.writeText(link.link); setCopied(true); }}><Copy aria-hidden className="h-4 w-4" /> {copied ? 'Kopyalandı' : 'Kopyala'}</Button>
            </div>
          )}
        </section>
      </div>
      {r.response && (
        <Card tone={r.status === 'agreed' ? 'success' : 'warn'} title={r.status === 'agreed' ? 'Mutabık' : 'Mutabık değil'} description={`${r.response.name}${r.response.title ? ` · ${r.response.title}` : ''} · ${new Date(r.response.at).toLocaleString('tr-TR')}${r.response.external ? ' · sistem dışından kaydedildi' : ''}`}>
          {r.response.counterBalance && (
            <p className="text-sm">
              Karşı tarafın bakiyesi <strong>{fm(r.response.counterBalance)}</strong> · fark <strong>{fm((b - BigInt(r.response.counterBalance)).toString())}</strong>
            </p>
          )}
          {r.response.note && <p className="mt-1 whitespace-pre-line text-sm">{r.response.note}</p>}
        </Card>
      )}
      {r.cancelReason && <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600">İptal nedeni: {r.cancelReason}</p>}
      <Card title="Dondurulan ekstre" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-4 py-3 text-left font-semibold">Tarih</th><th className="px-4 py-3 text-left font-semibold">Açıklama</th><th className="px-4 py-3 text-right font-semibold">Borç</th><th className="px-4 py-3 text-right font-semibold">Alacak</th><th className="px-4 py-3 text-right font-semibold">Bakiye</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {r.snapshot.rows.map((x, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-stone-600"><DateText value={x.date} /></td>
                  <td className="px-4 py-2.5">{x.text}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{x.debit !== '0' ? fm(x.debit) : ''}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{x.credit !== '0' ? fm(x.credit) : ''}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fm(x.balance)}</td>
                </tr>
              ))}
              {!r.snapshot.rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-500">Bu tarihe kadar hareket yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-sm"><Link href={`/muhasebe/cariler/${r.partyId}`} className="font-medium underline">Güncel cari ekstresine git</Link></p>
      {dialog === 'cancel' && (
        <ReasonDialog title="Mutabakatı iptal et" text="Bağlantı geçersiz olur; kayıt silinmez." label="İptal et" run={(reason) => cancelReconciliationAction({ id: r.id, version: r.version, reason })} onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh(); }} />
      )}
      {dialog === 'answer' && <AnswerDialog r={r} onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh(); }} />}
    </div>
  );
}

function AnswerDialog({ r, onClose, onDone }: { r: Detail; onClose: () => void; onDone: () => void }) {
  const save = useAction(recordReconciliationAnswerAction);
  const [status, setStatus] = useState<'agreed' | 'disputed'>('agreed');
  const f = save.fieldErrors;
  return (
    <Modal open title="Gelen cevabı kaydet" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run({ ...Object.fromEntries(new FormData(e.currentTarget)), status, id: r.id, version: r.version }, onDone); }}>
        <p className="text-sm text-stone-600">Kaşeli yazı, e-posta ya da telefonla gelen cevap için.</p>
        <div role="radiogroup" aria-label="Cevap" className="grid grid-cols-2 gap-2">
          {(['agreed', 'disputed'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={`min-h-11 rounded-xl border text-sm font-medium ${status === s ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-stone-300 bg-white'}`}>{s === 'agreed' ? 'Mutabık' : 'Mutabık değil'}</button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Cevaplayan" required error={f.name}><input name="name" className={fieldClass} /></FormField>
          <FormField label="Unvan" error={f.title}><input name="title" className={fieldClass} /></FormField>
        </div>
        {status === 'disputed' && <FormField label="Karşı tarafın bakiyesi" error={f.counterBalance}><input name="counterBalance" inputMode="decimal" className={fieldClass} /></FormField>}
        <FormField label="Not" required={status === 'disputed'} error={f.note}><textarea name="note" rows={3} className={fieldClass} /></FormField>
        {save.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{save.error}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={save.pending}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}
