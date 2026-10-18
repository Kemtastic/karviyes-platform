'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { istanbulToday } from '@/core/dates';
import { moneyFromJSON, type Currency } from '@/core/money';
import { CalendarClock, CalendarDays, Pencil, Printer, UserRound, Wallet } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button, buttonClasses } from '@/ui/button';
import { Card } from '@/ui/card';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { DateText } from '@/ui/date-text';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { Money } from '@/ui/money';
import { MoneyInput } from '@/ui/money-input';
import { useAction } from '@/ui/use-action';
import { addPaymentAction, cancelOrderAction, correctPaymentAction, markInvoicedAction, setDeliveryDateAction } from './actions';
import { recordOrderInvoiceAction } from '@/modules/finance/ui/actions';
import { PACKAGING_LABELS } from '../domain/packaging';
import { LINE_STATUS_LABELS, LINE_STATUS_TONES, ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from './status-labels';

type MoneyJson = { minor: string; currency: Currency };
type Order = {
  id: string; no: string; version: number; status: keyof typeof ORDER_STATUS_LABELS; orderDate: string; deliveryDate: string | null;
  party: { id: string; name: string; phone: string; city: string }; salesperson: string | null;
  quantity: number; currency: string; fxRate: string | null; fxRateDate: string | null; total: MoneyJson; balance: MoneyJson;
  lines: {
    id: string; lineNo: number; status: keyof typeof LINE_STATUS_LABELS; productText: string; quantity: number; unitPrice: string; vatRate: string; total: MoneyJson;
    packaging: { type: string; capacity: number; packages: number }; departmentNotes: Record<string, string>; producedQty: number; shippedQty: number; cancelReason: string | null; plateName: string | null;
  }[];
  invoiceMark: { no: string; date: string } | null; producedQty: number; shippedQty: number; cancelReason: string | null;
  payments: { id: string; kind: string; amount: MoneyJson; paidAt: string; note: string; correctsPaymentId: string | null }[];
};

const KIND: Record<string, string> = { deposit: 'Peşinat', payment: 'Tahsilat', correction: 'Düzeltme' };

export function OrderDetail({ order: o, canMarkInvoice, stageLabels = {}, financeEnabled = false }: { order: Order; canMarkInvoice: boolean; stageLabels?: Record<string, string>; financeEnabled?: boolean }) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [correcting, setCorrecting] = useState<Order['payments'][number] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useAction(cancelOrderAction);
  const currency = o.currency as Currency;
  const done = () => router.refresh();

  const paid = o.payments.reduce((sum, p) => sum + BigInt(p.amount.minor), 0n);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-stone-500">{o.no}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[26px]">{o.party.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
            <Badge tone={ORDER_STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
            <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden className="h-4 w-4 text-stone-400" /><DateText value={o.orderDate} /></span>
            <DeliveryDate order={o} onDone={done} />
            {o.salesperson && <span className="inline-flex items-center gap-1.5"><UserRound aria-hidden className="h-4 w-4 text-stone-400" />Satış: {o.salesperson}</span>}
            <Link href={`/cariler/${o.party.id}`} className="font-medium text-stone-700 underline-offset-2 hover:underline">Cari kartı</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/siparis/${o.id}`} className={buttonClasses('secondary')}><Printer aria-hidden className="h-4 w-4" /> Sipariş PDF</a>
          {o.status === 'draft' && <Link href={`/siparisler/${o.id}/duzenle`} className={buttonClasses('secondary')}><Pencil aria-hidden className="h-4 w-4" /> Düzenle</Link>}
          {o.status !== 'cancelled' && <Button variant="secondary" onClick={() => setPaying(true)}><Wallet aria-hidden className="h-4 w-4" /> Tahsilat ekle</Button>}
          {o.status === 'ready_to_invoice' && canMarkInvoice && <Button onClick={() => setInvoicing(true)}>Fatura kesildi olarak işaretle</Button>}
          {o.status === 'draft' && <Button variant="danger" onClick={() => setCancelling(true)}>Siparişi iptal et</Button>}
        </div>
      </header>

      {o.status === 'cancelled' && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">İptal edildi: {o.cancelReason}</p>}
      {o.invoiceMark && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">Fatura: {o.invoiceMark.no} · <DateText value={o.invoiceMark.date} /></p>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Toplam (KDV dahil)"><Money value={moneyFromJSON(o.total)} className="text-left text-xl font-semibold sm:text-2xl" /></Tile>
        <Tile label="Tahsil edilen"><Money value={moneyFromJSON({ minor: String(paid), currency })} className="text-left text-xl font-semibold sm:text-2xl" /></Tile>
        <Tile label="Kalan" highlight><Money value={moneyFromJSON(o.balance)} className="text-left text-xl font-semibold sm:text-2xl" /></Tile>
        <Tile label="Adet"><span className="text-xl font-semibold tabular-nums sm:text-2xl">{o.quantity.toLocaleString('tr-TR')}</span>{o.producedQty > 0 && <span className="block text-xs text-stone-500">üretilen {o.producedQty.toLocaleString('tr-TR')} · sevk {o.shippedQty.toLocaleString('tr-TR')}</span>}</Tile>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[1fr_380px]">
        <Card label="Ürünler" title="Ürünler" description={o.fxRate ? `Kur: ${o.fxRate} (${o.fxRateDate})` : undefined} padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-4 py-3 font-semibold">#</th><th className="px-4 py-3 font-semibold">Ürün</th><th className="px-4 py-3 text-right font-semibold">Adet</th><th className="px-4 py-3 text-right font-semibold">Birim fiyat</th><th className="px-4 py-3 text-right font-semibold">KDV</th><th className="px-4 py-3 text-right font-semibold">Tutar</th><th className="px-4 py-3 font-semibold">Paket</th><th className="px-4 py-3 font-semibold">Durum</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {o.lines.map((l) => (
                  <tr key={l.id} className={`align-top ${l.status === 'cancelled' ? 'text-stone-400 [&_td:not(:last-child)]:line-through' : ''}`}>
                    <td className="px-4 py-3 tabular-nums text-stone-500">{l.lineNo}</td>
                    <td className="max-w-sm px-4 py-3">
                      <span className="font-medium text-stone-800">{l.productText}</span>
                      {l.plateName && <span className="mt-1 block text-xs text-stone-600">Klişe: {l.plateName}</span>}
                      {Object.entries(l.departmentNotes).map(([k, v]) => <span key={k} className="mt-1.5 block rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 no-underline">{stageLabels[k] ?? k}: {v}</span>)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.quantity.toLocaleString('tr-TR')}{l.producedQty ? <span className="block text-xs text-stone-500">üretilen {l.producedQty.toLocaleString('tr-TR')} · sevk {l.shippedQty.toLocaleString('tr-TR')}</span> : null}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(l.unitPrice).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</td>
                    <td className="px-4 py-3 text-right tabular-nums">%{Number(l.vatRate).toLocaleString('tr-TR')}</td>
                    <td className="px-4 py-3"><Money value={moneyFromJSON(l.total)} /></td>
                    <td className="px-4 py-3 text-stone-600">{PACKAGING_LABELS[l.packaging.type as keyof typeof PACKAGING_LABELS]}{l.packaging.packages ? ` · ${l.packaging.packages} × ${l.packaging.capacity}` : ''}</td>
                    <td className="px-4 py-3"><Badge tone={LINE_STATUS_TONES[l.status]}>{LINE_STATUS_LABELS[l.status]}</Badge>{l.cancelReason && <span className="mt-1 block text-xs text-stone-500">{l.cancelReason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Tahsilatlar" padded={false} actions={o.status !== 'cancelled' ? <Button variant="ghost" className="min-h-9" onClick={() => setPaying(true)}>Ekle</Button> : undefined}>
          {o.payments.length ? (
            <ul className="divide-y divide-stone-100">
              {o.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium text-stone-800">{KIND[p.kind] ?? p.kind} <span className="text-xs font-normal text-stone-500"><DateText value={p.paidAt} /></span></span>
                    {p.note && <span className="block truncate text-xs text-stone-500">{p.note}</span>}
                  </span>
                  <Money value={moneyFromJSON(p.amount)} className="font-semibold" />
                  {p.kind !== 'correction' && o.status !== 'cancelled' && <Button variant="ghost" className="min-h-9 px-2" onClick={() => setCorrecting(p)}>Düzelt</Button>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-stone-500">Henüz tahsilat yok.</p>
          )}
        </Card>
      </div>

      {paying && <PaymentModal orderId={o.id} currency={currency} onClose={() => setPaying(false)} onDone={() => { setPaying(false); done(); }} />}
      {correcting && <CorrectionModal payment={correcting} currency={currency} onClose={() => setCorrecting(null)} onDone={() => { setCorrecting(null); done(); }} />}
      {invoicing && <InvoiceModal order={o} finance={financeEnabled} onClose={() => setInvoicing(false)} onDone={() => { setInvoicing(false); done(); }} />}
      <ConfirmDialog
        open={cancelling}
        title="Sipariş iptal edilsin mi?"
        message={<CancelReason onChange={setReason} error={cancel.error} />}
        confirmLabel="İptal et"
        tone="danger"
        busy={cancel.pending}
        onCancel={() => setCancelling(false)}
        onConfirm={() => cancel.run({ id: o.id, version: o.version, reason }, () => { setCancelling(false); done(); })}
      />
    </div>
  );
}

function CancelReason({ onChange, error }: { onChange: (r: string) => void; error: string }) {
  return (
    <div className="space-y-2">
      <p>İptal edilen sipariş üretime alınamaz. Kayıt ve tahsilatlar korunur.</p>
      <FormField label="İptal nedeni" required error={error || undefined}><input onChange={(e) => onChange(e.target.value)} className={fieldClass} /></FormField>
    </div>
  );
}

function PaymentModal({ orderId, currency, onClose, onDone }: { orderId: string; currency: Currency; onClose: () => void; onDone: () => void }) {
  const add = useAction(addPaymentAction);
  return (
    <Modal open title="Tahsilat ekle" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); add.run({ orderId, amount: f.amount, paidAt: f.paidAt, note: f.note }, onDone); }}>
        <FormField label="Tutar" required error={add.fieldErrors.amount}><MoneyInput name="amount" currency={currency} /></FormField>
        <FormField label="Tarih" required><input type="date" name="paidAt" defaultValue={istanbulToday()} className={fieldClass} /></FormField>
        <FormField label="Not"><input name="note" className={fieldClass} /></FormField>
        {add.error && <p role="alert" className="text-sm text-red-700">{add.error}</p>}
        <Button disabled={add.pending}>Kaydet</Button>
      </form>
    </Modal>
  );
}

function CorrectionModal({ payment, currency, onClose, onDone }: { payment: Order['payments'][number]; currency: Currency; onClose: () => void; onDone: () => void }) {
  const fix = useAction(correctPaymentAction);
  return (
    <Modal open title="Tahsilatı düzelt" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); fix.run({ paymentId: payment.id, amount: f.amount, note: f.note }, onDone); }}>
        <p className="text-sm text-stone-600">Orijinal kayıt silinmez; fark kadar düzeltme satırı eklenir.</p>
        <FormField label="Doğru tutar" required error={fix.fieldErrors.amount}><MoneyInput name="amount" currency={currency} /></FormField>
        <FormField label="Düzeltme nedeni" required error={fix.fieldErrors.note}><input name="note" className={fieldClass} /></FormField>
        {fix.error && <p role="alert" className="text-sm text-red-700">{fix.error}</p>}
        <Button disabled={fix.pending}>Düzeltmeyi kaydet</Button>
      </form>
    </Modal>
  );
}

function InvoiceModal({ order, finance, onClose, onDone }: { order: Order; finance: boolean; onClose: () => void; onDone: () => void }) {
  const mark = useAction(markInvoicedAction);
  const record = useAction(recordOrderInvoiceAction);
  const a = finance ? record : mark;
  const fe = a.fieldErrors;
  return (
    <Modal open title="Fatura kesildi" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          if (finance) record.run({ orderId: order.id, version: order.version, docNo: f.invoiceNo, date: f.invoiceDate, due: f.due || null }, onDone);
          else mark.run({ id: order.id, version: order.version, invoiceNo: f.invoiceNo, invoiceDate: f.invoiceDate }, onDone);
        }}
      >
        <p className="text-sm text-stone-600">Faturayı e-Fatura/e-Arşiv (ya da muhasebe programınızda) kestikten sonra numarasını buraya yazın.</p>
        <FormField label="Fatura no" required error={fe.invoiceNo ?? fe.docNo}><input name="invoiceNo" className={fieldClass} /></FormField>
        <FormField label="Fatura tarihi" required error={fe.date}><input type="date" name="invoiceDate" defaultValue={istanbulToday()} max={istanbulToday()} className={fieldClass} /></FormField>
        {finance && (
          <>
            <FormField label="Vade" error={fe.due} hint="Boşsa vadesiz"><input type="date" name="due" className={fieldClass} /></FormField>
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">Fatura ön muhasebede cariye satış faturası olarak da işlenir (KDV sipariş satırlarından).</p>
          </>
        )}
        {a.error && <p role="alert" className="text-sm text-red-700">{a.error}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button disabled={a.pending}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}

function Tile({ label, children, highlight = false }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] ${highlight ? 'border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)]' : 'border-stone-200/80 bg-white'}`}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      {children}
    </div>
  );
}

// Teslim tarihi: üretim sürerken de güncellenebilir; geçmişse ve sevk bitmediyse kırmızı.
function DeliveryDate({ order: o, onDone }: { order: Order; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const save = useAction(setDeliveryDateAction);
  const late = o.deliveryDate && o.deliveryDate < istanbulToday() && o.status !== 'cancelled' && o.status !== 'invoiced' && o.shippedQty < o.quantity;
  if (editing) {
    return (
      <form className="inline-flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('deliveryDate') ?? ''); save.run({ id: o.id, version: o.version, deliveryDate: v || null }, () => { setEditing(false); onDone(); }); }}>
        <input type="date" name="deliveryDate" aria-label="Teslim tarihi" defaultValue={o.deliveryDate ?? ''} min={o.orderDate} className={`${fieldClass} min-h-9 w-auto py-1 text-sm`} />
        <Button className="min-h-9 px-3" disabled={save.pending}>Kaydet</Button>
        <Button type="button" variant="ghost" className="min-h-9 px-2" onClick={() => setEditing(false)}>Vazgeç</Button>
        {save.error && <span role="alert" className="text-red-700">{save.error}</span>}
      </form>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${late ? 'font-semibold text-red-700' : ''}`}>
      <CalendarClock aria-hidden className={`h-4 w-4 ${late ? '' : 'text-stone-400'}`} />
      {o.deliveryDate ? <>Teslim <DateText value={o.deliveryDate} />{late && ' · gecikti'}</> : 'Teslim tarihi yok'}
      {o.status !== 'cancelled' && <button type="button" onClick={() => setEditing(true)} className="ml-1 text-xs font-medium text-stone-500 underline hover:text-stone-800">{o.deliveryDate ? 'değiştir' : 'ekle'}</button>}
    </span>
  );
}
