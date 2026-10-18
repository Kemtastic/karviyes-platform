'use client';
import { useEffect, useState } from 'react';
import { istanbulToday } from '@/core/dates';
import { CURRENCIES, formatMoney, moneyFromJSON, type Currency } from '@/core/money';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import {
  createAccountAction, endorseCheckAction, findPartiesAction, partyOpenOrdersAction, issueCheckAction, receiveCheckAction, recordExpenseAction, recordInvoiceAction,
  recordPaymentAction, setOpeningAction, settleCheckAction, transferAction,
} from './actions';

export type AccountOption = { id: string; name: string; kind: string; currency: string };
export type PartyRef = { id: string; name: string };
type Done = { onClose: () => void; onDone: () => void };

const EXPENSE_CATEGORIES = ['Kira', 'Elektrik, su, doğalgaz', 'Personel', 'Yakıt ve ulaşım', 'Kargo ve nakliye', 'Bakım ve onarım', 'Vergi ve harç', 'Banka masrafı', 'Ofis ve kırtasiye', 'Yemek', 'Diğer'];
const INCOME_CATEGORIES = ['Faiz geliri', 'Kur farkı', 'Hurda satışı', 'Kira geliri', 'Diğer'];

function formData(e: React.FormEvent<HTMLFormElement>): Record<string, string> {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
}

function Footer({ onClose, pending, label, error }: { onClose: () => void; pending: boolean; label: string; error: string }) {
  return (
    <>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
        <Button disabled={pending}>{pending ? 'Kaydediliyor…' : label}</Button>
      </div>
    </>
  );
}

/** Cari arama kutusu; seçilen cari adıyla gösterilir. */
export function PartyPicker({ value, onChange, kind, error, label = 'Cari' }: { value: PartyRef | null; onChange: (p: PartyRef | null) => void; kind?: 'customer' | 'supplier'; error?: string; label?: string }) {
  const [results, setResults] = useState<PartyRef[]>([]);
  return (
    <div className="space-y-1.5">
      <FormField label={label} required error={error}>
        {value ? (
          <span className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)] px-3 py-2.5">
            <strong className="font-medium">{value.name}</strong>
            <button type="button" className="text-sm font-medium text-[var(--brand-strong)] hover:underline" onClick={() => onChange(null)}>Değiştir</button>
          </span>
        ) : (
          <input className={fieldClass} placeholder="Cari adıyla arayın" autoComplete="off" onChange={async (e) => setResults(e.target.value.trim().length >= 2 ? await findPartiesAction({ q: e.target.value, kind }) : [])} />
        )}
      </FormField>
      {!value && results.length > 0 && (
        <ul className="max-h-48 divide-y divide-stone-100 overflow-auto rounded-xl border border-stone-200 shadow-sm">
          {results.map((r) => (
            <li key={r.id}><button type="button" className="w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--brand-softer)]" onClick={() => { onChange(r); setResults([]); }}>{r.name}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountSelect({ accounts, name = 'accountId', label = 'Kasa / banka', error, currency }: { accounts: AccountOption[]; name?: string; label?: string; error?: string; currency?: string }) {
  const list = currency ? accounts.filter((a) => a.currency === currency) : accounts;
  return (
    <FormField label={label} required error={error} hint={!list.length ? 'Önce Kasa ve Banka ekranından hesap açın.' : undefined}>
      <select name={name} className={fieldClass} defaultValue={list[0]?.id ?? ''}>
        {list.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
      </select>
    </FormField>
  );
}

const today = () => istanbulToday();

export function AccountDialog({ onClose, onDone }: Done) {
  const save = useAction(createAccountAction);
  const [kind, setKind] = useState<'cash' | 'bank'>('bank');
  const f = save.fieldErrors;
  return (
    <Modal open title="Kasa / banka hesabı aç" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => save.run({ ...formData(e), kind }, onDone)}>
        <div role="radiogroup" aria-label="Hesap türü" className="grid grid-cols-2 gap-2">
          {(['bank', 'cash'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-11 rounded-xl border text-sm font-medium ${kind === k ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-stone-300 bg-white text-stone-700'}`}>
              {k === 'bank' ? 'Banka' : 'Kasa'}
            </button>
          ))}
        </div>
        <FormField label="Hesap adı" required error={f.name}><input name="name" className={fieldClass} placeholder={kind === 'bank' ? 'örn. Ziraat TL' : 'örn. Merkez kasa'} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Para birimi" required error={f.currency}><select name="currency" className={fieldClass}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></FormField>
          <FormField label="Açılış bakiyesi" error={f.opening} hint="Hesabın bugünkü bakiyesi"><input name="opening" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
        </div>
        <FormField label="Açılış tarihi" required error={f.openingDate}><input type="date" name="openingDate" defaultValue={today()} className={fieldClass} /></FormField>
        {kind === 'bank' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Banka" error={f.bank}><input name="bank" className={fieldClass} /></FormField>
            <FormField label="IBAN" error={f.iban}><input name="iban" className={`${fieldClass} font-mono`} placeholder="TR.." /></FormField>
          </div>
        )}
        <Footer onClose={onClose} pending={save.pending} label="Hesabı aç" error={save.error} />
      </form>
    </Modal>
  );
}

export type InvoiceKind = 'sales' | 'purchase' | 'sales_return' | 'purchase_return';
const INVOICE_TITLES: Record<InvoiceKind, string> = { sales: 'Satış faturası kaydet', purchase: 'Alış faturası kaydet', sales_return: 'Satış iade faturası kaydet', purchase_return: 'Alış iade faturası kaydet' };

export function InvoiceDialog({ kind, party: fixed, onClose, onDone }: Done & { kind: InvoiceKind; party?: PartyRef }) {
  const customerSide = kind === 'sales' || kind === 'sales_return';
  const save = useAction(recordInvoiceAction);
  const [party, setParty] = useState<PartyRef | null>(fixed ?? null);
  const [base, setBase] = useState('');
  const [rate, setRate] = useState('20');
  const [withholding, setWithholding] = useState('0');
  const f = save.fieldErrors;
  const baseNum = Number(base.replace(/\./g, '').replace(',', '.')) || 0;
  const vat = Math.round(baseNum * Number(rate)) / 100;
  const wh = Math.round(vat * Number(withholding) * 10) / 100;
  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Modal open title={INVOICE_TITLES[kind]} onClose={onClose} dirty={Boolean(base)}>
      <form className="space-y-4" onSubmit={(e) => save.run({ ...formData(e), kind, partyId: party?.id ?? '', due: (e.currentTarget.elements.namedItem('due') as HTMLInputElement).value || null }, onDone)}>
        <p className="rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-600">Bu ekran fatura <strong>kesmez</strong>; e-Fatura, e-Arşiv ya da kâğıt olarak kesilmiş faturayı cariye işler.</p>
        {kind.endsWith('_return') && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">İade faturası cariyi ters yönde etkiler ve KDV özetinde düşülür.</p>}
        {!fixed && <PartyPicker value={party} onChange={setParty} kind={customerSide ? 'customer' : 'supplier'} error={f.partyId} label={customerSide ? 'Müşteri' : 'Tedarikçi'} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Fatura no" required error={f.docNo}><input name="docNo" className={`${fieldClass} font-mono`} placeholder="GIB2026000000001" /></FormField>
          <FormField label="Para birimi" required error={f.currency}><select name="currency" className={fieldClass}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></FormField>
          <FormField label="Fatura tarihi" required error={f.date}><input type="date" name="date" defaultValue={today()} max={today()} className={fieldClass} /></FormField>
          <FormField label="Vade" error={f.due} hint="Boşsa vadesiz"><input type="date" name="due" className={fieldClass} /></FormField>
          <FormField label="Matrah (KDV hariç)" required error={f.base}><input name="base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="KDV oranı" error={f.vatRate}>
            <select name="vatRate" value={rate} onChange={(e) => setRate(e.target.value)} className={fieldClass}>{['0', '1', '10', '20'].map((r) => <option key={r} value={r}>%{r}</option>)}</select>
          </FormField>
          <FormField label="Tevkifat" error={f.withholding} hint="KDV'nin onda kaçı">
            <select name="withholding" value={withholding} onChange={(e) => setWithholding(e.target.value)} className={fieldClass}>
              <option value="0">Yok</option>
              {[2, 3, 4, 5, 7, 9, 10].map((n) => <option key={n} value={n}>{n}/10</option>)}
            </select>
          </FormField>
          <FormField label="Not" error={f.note}><input name="note" className={fieldClass} /></FormField>
        </div>
        <dl className="grid grid-cols-3 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
          <div><dt className="text-xs text-stone-500">KDV</dt><dd className="font-medium tabular-nums">{fmt(vat)}</dd></div>
          <div><dt className="text-xs text-stone-500">Tevkifat</dt><dd className="font-medium tabular-nums">{fmt(wh)}</dd></div>
          <div><dt className="text-xs text-stone-500">Fatura toplamı</dt><dd className="text-base font-semibold tabular-nums">{fmt(baseNum + vat - wh)}</dd></div>
        </dl>
        <Footer onClose={onClose} pending={save.pending} label="Faturayı kaydet" error={save.error} />
      </form>
    </Modal>
  );
}

type OpenOrder = { id: string; no: string; orderDate: string; balance: { minor: string; currency: string } };

export function PaymentDialog({ kind, accounts, party: fixed, onClose, onDone }: Done & { kind: 'collection' | 'payment'; accounts: AccountOption[]; party?: PartyRef }) {
  const save = useAction(recordPaymentAction);
  const [party, setPartyState] = useState<PartyRef | null>(fixed ?? null);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const f = save.fieldErrors;
  const loadOrders = (p: PartyRef | null) => {
    setOrders([]);
    if (p && kind === 'collection') void partyOpenOrdersAction({ partyId: p.id }).then(setOrders);
  };
  const setParty = (p: PartyRef | null) => { setPartyState(p); loadOrders(p); };
  useEffect(() => {
    if (fixed && kind === 'collection') void partyOpenOrdersAction({ partyId: fixed.id }).then(setOrders);
  }, [fixed, kind]);
  return (
    <Modal open title={kind === 'collection' ? 'Tahsilat al' : 'Ödeme yap'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { const d = formData(e); save.run({ ...d, kind, partyId: party?.id ?? '', orderId: d.orderId || null }, onDone); }}>
        {!fixed && <PartyPicker value={party} onChange={setParty} kind={kind === 'collection' ? 'customer' : undefined} error={f.partyId} />}
        <AccountSelect accounts={accounts} error={f.accountId} label={kind === 'collection' ? 'Giren hesap' : 'Çıkan hesap'} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tutar" required error={f.amount} hint="Hesabın para biriminde"><input name="amount" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="Tarih" required error={f.date}><input type="date" name="date" defaultValue={today()} max={today()} className={fieldClass} /></FormField>
        </div>
        <FormField label="Açıklama" error={f.note}><input name="note" className={fieldClass} placeholder={kind === 'collection' ? 'örn. Havale, S-2026-000004' : 'örn. Kumaş ödemesi'} /></FormField>
        {orders.length > 0 && (
          <FormField label="Siparişe de işle" error={f.orderId} hint="Seçilirse tahsilat sipariş bakiyesinden de düşer; iki ekrana ayrı ayrı girmeyin.">
            <select name="orderId" className={fieldClass} defaultValue="">
              <option value="">Siparişe bağlama</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.no} · kalan {formatMoney(moneyFromJSON(o.balance as { minor: string; currency: Currency }))}</option>)}
            </select>
          </FormField>
        )}
        <Footer onClose={onClose} pending={save.pending} label={kind === 'collection' ? 'Tahsilatı kaydet' : 'Ödemeyi kaydet'} error={save.error} />
      </form>
    </Modal>
  );
}

export function ExpenseDialog({ direction, accounts, onClose, onDone }: Done & { direction: 'out' | 'in'; accounts: AccountOption[] }) {
  const save = useAction(recordExpenseAction);
  const f = save.fieldErrors;
  const cats = direction === 'out' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  return (
    <Modal open title={direction === 'out' ? 'Masraf gir' : 'Diğer gelir gir'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => save.run({ ...formData(e), direction }, onDone)}>
        <FormField label="Kategori" required error={f.category}><select name="category" className={fieldClass}>{cats.map((c) => <option key={c}>{c}</option>)}</select></FormField>
        <AccountSelect accounts={accounts} error={f.accountId} label={direction === 'out' ? 'Ödenen hesap' : 'Giren hesap'} />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Tutar (KDV dahil)" required error={f.amount}><input name="amount" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="KDV oranı" error={f.vatRate}><select name="vatRate" defaultValue="20" className={fieldClass}>{['0', '1', '10', '20'].map((r) => <option key={r} value={r}>%{r}</option>)}</select></FormField>
          <FormField label="Tarih" required error={f.date}><input type="date" name="date" defaultValue={today()} max={today()} className={fieldClass} /></FormField>
        </div>
        <FormField label="Açıklama" error={f.note}><input name="note" className={fieldClass} /></FormField>
        <Footer onClose={onClose} pending={save.pending} label="Kaydet" error={save.error} />
      </form>
    </Modal>
  );
}

export function TransferDialog({ accounts, onClose, onDone }: Done & { accounts: AccountOption[] }) {
  const save = useAction(transferAction);
  const f = save.fieldErrors;
  return (
    <Modal open title="Hesaplar arası virman" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => save.run(formData(e), onDone)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <AccountSelect accounts={accounts} name="fromAccountId" label="Çıkan hesap" error={f.fromAccountId} />
          <FormField label="Giren hesap" required error={f.toAccountId}>
            <select name="toAccountId" className={fieldClass} defaultValue={accounts[1]?.id ?? ''}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select>
          </FormField>
          <FormField label="Tutar" required error={f.amount}><input name="amount" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="Tarih" required error={f.date}><input type="date" name="date" defaultValue={today()} max={today()} className={fieldClass} /></FormField>
        </div>
        <FormField label="Açıklama" error={f.note}><input name="note" className={fieldClass} placeholder="örn. Bankadan kasaya nakit çekim" /></FormField>
        <Footer onClose={onClose} pending={save.pending} label="Virmanı kaydet" error={save.error} />
      </form>
    </Modal>
  );
}

export function CheckDialog({ direction, onClose, onDone }: Done & { direction: 'received' | 'issued' }) {
  const save = useAction(direction === 'received' ? receiveCheckAction : issueCheckAction);
  const [party, setParty] = useState<PartyRef | null>(null);
  const f = save.fieldErrors;
  return (
    <Modal open title={direction === 'received' ? 'Müşteri çeki al' : 'Kendi çekimizi ver'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => save.run({ ...formData(e), partyId: party?.id ?? '' }, onDone)}>
        <PartyPicker value={party} onChange={setParty} kind={direction === 'issued' ? 'supplier' : undefined} error={f.partyId} label={direction === 'received' ? 'Çeki veren cari' : 'Çeki alan tedarikçi'} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Banka" required error={f.bank}><input name="bank" className={fieldClass} /></FormField>
          <FormField label="Çek no" required error={f.checkNo}><input name="checkNo" className={`${fieldClass} font-mono`} /></FormField>
          <FormField label="Tutar" required error={f.amount}><input name="amount" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="Para birimi" required error={f.currency}><select name="currency" className={fieldClass}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></FormField>
          <FormField label={direction === 'received' ? 'Alış tarihi' : 'Veriliş tarihi'} required error={f.date}><input type="date" name="date" defaultValue={today()} max={today()} className={fieldClass} /></FormField>
          <FormField label="Vade" required error={f.due}><input type="date" name="due" className={fieldClass} /></FormField>
        </div>
        <FormField label="Not" error={f.note}><input name="note" className={fieldClass} /></FormField>
        <Footer onClose={onClose} pending={save.pending} label="Çeki kaydet" error={save.error} />
      </form>
    </Modal>
  );
}

export function SettleCheckDialog({ check, accounts, onClose, onDone }: Done & { check: { id: string; version: number; direction: string; currency: string; label: string }; accounts: AccountOption[] }) {
  const save = useAction(settleCheckAction);
  const f = save.fieldErrors;
  return (
    <Modal open title={check.direction === 'received' ? 'Çeki tahsil et' : 'Çeki öde'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => save.run({ ...formData(e), id: check.id, version: check.version }, onDone)}>
        <p className="text-sm text-stone-600">{check.label}</p>
        <AccountSelect accounts={accounts} currency={check.currency} error={f.accountId} label={check.direction === 'received' ? 'Yatan hesap' : 'Ödenen hesap'} />
        <FormField label="Tarih" required error={f.date}><input type="date" name="date" defaultValue={today()} max={today()} className={fieldClass} /></FormField>
        <Footer onClose={onClose} pending={save.pending} label="Kaydet" error={save.error} />
      </form>
    </Modal>
  );
}

export function EndorseCheckDialog({ check, onClose, onDone }: Done & { check: { id: string; version: number; label: string } }) {
  const save = useAction(endorseCheckAction);
  const [party, setParty] = useState<PartyRef | null>(null);
  const f = save.fieldErrors;
  return (
    <Modal open title="Çeki ciro et" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => save.run({ ...formData(e), id: check.id, version: check.version, partyId: party?.id ?? '' }, onDone)}>
        <p className="text-sm text-stone-600">{check.label}</p>
        <PartyPicker value={party} onChange={setParty} kind="supplier" error={f.partyId} label="Ciro edilen tedarikçi" />
        <FormField label="Tarih" required error={f.date}><input type="date" name="date" defaultValue={today()} max={today()} className={fieldClass} /></FormField>
        <Footer onClose={onClose} pending={save.pending} label="Ciro et" error={save.error} />
      </form>
    </Modal>
  );
}

export function OpeningDialog({ party, onClose, onDone }: Done & { party: PartyRef }) {
  const save = useAction(setOpeningAction);
  const f = save.fieldErrors;
  return (
    <Modal open title="Açılış (devir) bakiyesi" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => save.run({ ...formData(e), partyId: party.id }, onDone)}>
        <p className="text-sm text-stone-600">{party.name} için sisteme geçmeden önceki bakiye. Sıfır girerseniz kaldırılır.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tutar" required error={f.amount}><input name="amount" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
          <FormField label="Para birimi" required error={f.currency}><select name="currency" className={fieldClass}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></FormField>
          <FormField label="Yön" required error={f.side}>
            <select name="side" className={fieldClass}><option value="debit">Cari bize borçlu</option><option value="credit">Biz cariye borçluyuz</option></select>
          </FormField>
          <FormField label="Tarih" required error={f.date}><input type="date" name="date" defaultValue={`${today().slice(0, 4)}-01-01`} className={fieldClass} /></FormField>
        </div>
        <Footer onClose={onClose} pending={save.pending} label="Kaydet" error={save.error} />
      </form>
    </Modal>
  );
}

/** İptal, iade gibi gerekçe isteyen işlemler. */
export function ReasonDialog({ title, text, label, run, onClose, onDone }: Done & { title: string; text: string; label: string; run: (reason: string) => Promise<{ ok: boolean; message?: string }> }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <Modal open title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const r = await run(reason);
          setPending(false);
          if (r.ok) onDone();
          else setError(r.message ?? 'İşlem yapılamadı.');
        }}
      >
        <p className="text-sm text-stone-600">{text}</p>
        <FormField label="Neden" required><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={fieldClass} /></FormField>
        <Footer onClose={onClose} pending={pending} label={label} error={error} />
      </form>
    </Modal>
  );
}
