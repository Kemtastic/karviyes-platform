'use client';
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
import { ORDER_STATUS_LABELS } from './status-labels';

type MoneyJson = { minor: string; currency: Currency };
type Order = {
  id: string; no: string; version: number; status: keyof typeof ORDER_STATUS_LABELS; orderDate: string;
  party: { id: string; name: string; phone: string; city: string }; salesperson: string | null;
  productText: string; quantity: number; unitPrice: string; vatRate: string; currency: string; fxRate: string | null; fxRateDate: string | null;
  total: MoneyJson; balance: MoneyJson; packaging: { type: string; capacity: number; packages: number }; departmentNotes: Record<string, string>;
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
          <h1 className="text-2xl font-semibold">{o.party.name}</h1>
          <p className="text-stone-600"><DateText value={o.orderDate} /> · {ORDER_STATUS_LABELS[o.status]}{o.salesperson ? ` · Satış: ${o.salesperson}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/siparis/${o.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold">Sipariş PDF</a>
          {o.status !== 'cancelled' && <Button variant="secondary" onClick={() => setPaying(true)}>Tahsilat ekle</Button>}
          {o.status === 'ready_to_invoice' && canMarkInvoice && <Button onClick={() => setInvoicing(true)}>Fatura kesildi olarak işaretle</Button>}
          {o.status === 'draft' && <Button variant="danger" onClick={() => setCancelling(true)}>Siparişi iptal et</Button>}
        </div>
      </div>

      {o.status === 'cancelled' && <p className="rounded-lg bg-red-50 p-3 text-red-800">İptal edildi: {o.cancelReason}</p>}
      {o.invoiceMark && <p className="rounded-lg bg-green-50 p-3 text-green-800">Fatura: {o.invoiceMark.no} · <DateText value={o.invoiceMark.date} /></p>}

      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-4">
        <div className="sm:col-span-4"><p className="text-sm text-stone-500">Ürün</p><p className="font-medium">{o.productText}</p></div>
        <div><p className="text-sm text-stone-500">Adet</p><p className="font-medium tabular-nums">{o.quantity.toLocaleString('tr-TR')}</p></div>
        <div><p className="text-sm text-stone-500">Üretilen / sevk</p><p className="font-medium tabular-nums">{o.producedQty.toLocaleString('tr-TR')} / {o.shippedQty.toLocaleString('tr-TR')}</p></div>
        <div><p className="text-sm text-stone-500">Birim fiyat · KDV</p><p className="font-medium">{Number(o.unitPrice).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} · %{Number(o.vatRate).toLocaleString('tr-TR')}</p></div>
        <div><p className="text-sm text-stone-500">Paketleme</p><p className="font-medium">{PACKAGING_LABELS[o.packaging.type as keyof typeof PACKAGING_LABELS]} {o.packaging.packages ? `· ${o.packaging.packages} × ${o.packaging.capacity}` : ''}</p></div>
        {o.fxRate && <div className="sm:col-span-4 text-sm text-stone-600">Kur: {o.fxRate} ({o.fxRateDate})</div>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-sm text-stone-500">Toplam (KDV dahil)</p><Money value={moneyFromJSON(o.total)} className="text-left text-2xl font-semibold" /></div>
        <div className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-sm text-stone-500">Kalan</p><Money value={moneyFromJSON(o.balance)} className="text-left text-2xl font-semibold" /></div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Tahsilatlar</h2>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-600"><tr><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Tür</th><th className="px-3 py-2">Not</th><th className="px-3 py-2 text-right">Tutar</th><th /></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {o.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2"><DateText value={p.paidAt} /></td>
                  <td className="px-3 py-2">{KIND[p.kind] ?? p.kind}</td>
                  <td className="px-3 py-2 text-stone-600">{p.note}</td>
                  <td className="px-3 py-2"><Money value={moneyFromJSON(p.amount)} /></td>
                  <td className="px-3 py-2 text-right">{p.kind !== 'correction' && o.status !== 'cancelled' && <Button variant="ghost" onClick={() => setCorrecting(p)}>Düzelt</Button>}</td>
                </tr>
              ))}
              {!o.payments.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-stone-500">Henüz tahsilat yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {Object.keys(o.departmentNotes).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Bölüm notları</h2>
          <ul className="grid gap-2 sm:grid-cols-2">{Object.entries(o.departmentNotes).map(([k, v]) => <li key={k} className="rounded-lg bg-amber-50 p-3"><strong className="block text-sm">{k}</strong>{v}</li>)}</ul>
        </section>
      )}

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
