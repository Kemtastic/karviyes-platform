'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { istanbulToday } from '@/core/dates';
import { moneyFromJSON, type Currency } from '@/core/money';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { DateText } from '@/ui/date-text';
import { FormField, fieldClass } from '@/ui/form-field';
import { Modal } from '@/ui/modal';
import { Money } from '@/ui/money';
import { MoneyInput } from '@/ui/money-input';
import { useAction } from '@/ui/use-action';
import { addPaymentAction, cancelOrderAction, correctPaymentAction, markInvoicedAction } from './actions';
import { PACKAGING_LABELS } from '../domain/packaging';
import { LINE_STATUS_LABELS, ORDER_STATUS_LABELS } from './status-labels';

type MoneyJson = { minor: string; currency: Currency };
type Order = {
  id: string; no: string; version: number; status: keyof typeof ORDER_STATUS_LABELS; orderDate: string;
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

export function OrderDetail({ order: o, canMarkInvoice }: { order: Order; canMarkInvoice: boolean }) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [correcting, setCorrecting] = useState<Order['payments'][number] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useAction(cancelOrderAction);
  const currency = o.currency as Currency;
  const done = () => router.refresh();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-stone-500">{o.no}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">{o.party.name}</h1>
          <p className="text-stone-600"><DateText value={o.orderDate} /> · {ORDER_STATUS_LABELS[o.status]}{o.salesperson ? ` · Satış: ${o.salesperson}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/siparis/${o.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition-colors hover:border-stone-400 hover:bg-stone-50">Sipariş PDF</a>
          {o.status !== 'cancelled' && <Button variant="secondary" onClick={() => setPaying(true)}>Tahsilat ekle</Button>}
          {o.status === 'ready_to_invoice' && canMarkInvoice && <Button onClick={() => setInvoicing(true)}>Fatura kesildi olarak işaretle</Button>}
          {o.status === 'draft' && <Link href={`/siparisler/${o.id}/duzenle`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition-colors hover:border-stone-400 hover:bg-stone-50">Düzenle</Link>}
          {o.status === 'draft' && <Button variant="danger" onClick={() => setCancelling(true)}>Siparişi iptal et</Button>}
        </div>
      </div>

      {o.status === 'cancelled' && <p className="rounded-lg bg-red-50 p-3 text-red-800">İptal edildi: {o.cancelReason}</p>}
      {o.invoiceMark && <p className="rounded-lg bg-green-50 p-3 text-green-800">Fatura: {o.invoiceMark.no} · <DateText value={o.invoiceMark.date} /></p>}

      <section aria-label="Ürünler" className="space-y-2">
        <h2 className="text-[15px] font-semibold text-stone-900">Ürünler</h2>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-4 py-3 font-semibold">#</th><th className="px-4 py-3 font-semibold">Ürün</th><th className="px-4 py-3 font-semibold text-right">Adet</th><th className="px-4 py-3 font-semibold text-right">Birim fiyat</th><th className="px-4 py-3 font-semibold text-right">KDV</th><th className="px-4 py-3 font-semibold text-right">Tutar</th><th className="px-4 py-3 font-semibold">Paket</th><th className="px-4 py-3 font-semibold">Durum</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {o.lines.map((l) => (
                <tr key={l.id} className={l.status === 'cancelled' ? 'text-stone-400 line-through' : ''}>
                  <td className="px-4 py-3 tabular-nums">{l.lineNo}</td>
                  <td className="px-4 py-3">
                    {l.productText}
                    {l.plateName && <span className="block text-xs text-stone-600">Klişe: {l.plateName}</span>}
                    {Object.entries(l.departmentNotes).map(([k, v]) => <span key={k} className="mt-1 block rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 no-underline">{k}: {v}</span>)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.quantity.toLocaleString('tr-TR')}{l.producedQty ? <span className="block text-xs text-stone-500">üretilen {l.producedQty.toLocaleString('tr-TR')} · sevk {l.shippedQty.toLocaleString('tr-TR')}</span> : null}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(l.unitPrice).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</td>
                  <td className="px-4 py-3 text-right tabular-nums">%{Number(l.vatRate).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3"><Money value={moneyFromJSON(l.total)} /></td>
                  <td className="px-4 py-3">{PACKAGING_LABELS[l.packaging.type as keyof typeof PACKAGING_LABELS]}{l.packaging.packages ? ` · ${l.packaging.packages} × ${l.packaging.capacity}` : ''}</td>
                  <td className="px-4 py-3">{LINE_STATUS_LABELS[l.status]}{l.cancelReason ? `: ${l.cancelReason}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {o.fxRate && <p className="text-sm text-stone-600">Kur: {o.fxRate} ({o.fxRateDate})</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5"><p className="text-sm text-stone-500">Toplam (KDV dahil)</p><Money value={moneyFromJSON(o.total)} className="text-left text-2xl font-semibold" /></div>
        <div className="rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] p-5"><p className="text-sm text-stone-500">Kalan</p><Money value={moneyFromJSON(o.balance)} className="text-left text-2xl font-semibold" /></div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-stone-900">Tahsilatlar</h2>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-4 py-3 font-semibold">Tarih</th><th className="px-4 py-3 font-semibold">Tür</th><th className="px-4 py-3 font-semibold">Not</th><th className="px-4 py-3 font-semibold text-right">Tutar</th><th /></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {o.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3"><DateText value={p.paidAt} /></td>
                  <td className="px-4 py-3">{KIND[p.kind] ?? p.kind}</td>
                  <td className="px-4 py-3 text-stone-600">{p.note}</td>
                  <td className="px-4 py-3"><Money value={moneyFromJSON(p.amount)} /></td>
                  <td className="px-4 py-3 text-right">{p.kind !== 'correction' && o.status !== 'cancelled' && <Button variant="ghost" onClick={() => setCorrecting(p)}>Düzelt</Button>}</td>
                </tr>
              ))}
              {!o.payments.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-stone-500">Henüz tahsilat yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {paying && <PaymentModal orderId={o.id} currency={currency} onClose={() => setPaying(false)} onDone={() => { setPaying(false); done(); }} />}
      {correcting && <CorrectionModal payment={correcting} currency={currency} onClose={() => setCorrecting(null)} onDone={() => { setCorrecting(null); done(); }} />}
      {invoicing && <InvoiceModal order={o} onClose={() => setInvoicing(false)} onDone={() => { setInvoicing(false); done(); }} />}
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

function InvoiceModal({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const mark = useAction(markInvoicedAction);
  return (
    <Modal open title="Fatura kesildi" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); mark.run({ id: order.id, version: order.version, invoiceNo: f.invoiceNo, invoiceDate: f.invoiceDate }, onDone); }}>
        <p className="text-sm text-stone-600">Faturayı muhasebe programınızda kestikten sonra numarasını buraya yazın.</p>
        <FormField label="Fatura no" required error={mark.fieldErrors.invoiceNo}><input name="invoiceNo" className={fieldClass} /></FormField>
        <FormField label="Fatura tarihi" required><input type="date" name="invoiceDate" defaultValue={istanbulToday()} className={fieldClass} /></FormField>
        {mark.error && <p role="alert" className="text-sm text-red-700">{mark.error}</p>}
        <Button disabled={mark.pending}>Kaydet</Button>
      </form>
    </Modal>
  );
}
