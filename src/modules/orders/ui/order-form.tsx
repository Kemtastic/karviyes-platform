'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { istanbulToday } from '@/core/dates';
import { formatMoney, type Currency } from '@/core/money';
import { getSector } from '@/sectors';
import type { SectorField } from '@/sectors/types';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { MoneyInput } from '@/ui/money-input';
import { useAction } from '@/ui/use-action';
import { createOrderAction, searchCustomersAction } from './actions';
import { computeOrderTotal, parseRate, parseUnitPrice } from '../domain/totals';
import { PACKAGING_LABELS } from '../domain/packaging';

type Props = { sector: string; salesStaff: { id: string; name: string }[] };

export function OrderForm({ sector: sectorId, salesStaff }: Props) {
  const router = useRouter();
  const sector = getSector(sectorId);
  const [product, setProduct] = useState<Record<string, string | boolean>>({ shape: 'Körüksüz', handle: 'El Geçme', biyeType: 'Biyeli', gusset: '0', biye: '5', colour: 'Beyaz' });
  const [party, setParty] = useState<{ id: string; name: string } | null>(null);
  const [unitPrice, setUnitPrice] = useState('');
  const [vatRate, setVatRate] = useState('10');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [qtyOverride, setQtyOverride] = useState('');
  const create = useAction(createOrderAction);
  const fe = create.fieldErrors;

  const preview = useMemo(() => {
    const calc = sector.calculate({ ...product, biyeType: product.biyeType === 'Biyesiz' ? 'without' : 'with' });
    const target = Number(qtyOverride) || Number(calc.target) || 0;
    let total = '';
    try {
      if (unitPrice && target) total = formatMoney(computeOrderTotal(parseUnitPrice(unitPrice), target, parseRate(vatRate, 'vatRate', 'KDV'), currency));
    } catch {
      total = '';
    }
    return { calc, target, total };
  }, [product, qtyOverride, unitPrice, vatRate, currency, sector]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const departmentNotes = Object.fromEntries(sector.stages.map((s) => [s.id, f[`note_${s.id}`] ?? '']));
    create.run(
      {
        partyId: party?.id ?? '',
        salespersonStaffId: f.salespersonStaffId,
        orderDate: f.orderDate,
        product: { ...product, biyeType: product.biyeType === 'Biyesiz' ? 'without' : 'with' },
        quantity: qtyOverride ? Number(qtyOverride) : undefined,
        unitPrice,
        vatRate,
        currency,
        fxRate: f.fxRate || undefined,
        fxRateDate: f.fxRateDate || undefined,
        deposit: f.deposit,
        packaging: { type: f.packagingType, capacity: Number(f.packagingCapacity || 0) },
        departmentNotes,
      },
      (d) => router.push(`/siparisler/${d.id}`),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Müşteri</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><CustomerPicker value={party} onChange={setParty} error={fe.partyId} /></div>
          <FormField label="Sipariş tarihi" required error={fe.orderDate}><input type="date" name="orderDate" defaultValue={istanbulToday()} className={fieldClass} /></FormField>
          <FormField label="Satış yapan" required error={fe.salespersonStaffId}>
            <select name="salespersonStaffId" className={fieldClass} defaultValue="">
              <option value="" disabled>Seçin</option>
              {salesStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
        </div>
        {!salesStaff.length && <p className="text-sm text-amber-800">Satış personeli tanımlı değil. Ayarlar → Personel bölümünden “Satış” bölümüyle personel ekleyin.</p>}
      </section>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Ürün</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {sector.productFields.map((field) => (
            <ProductField key={field.key} field={field} value={product[field.key]} error={fe[`product.${field.key}`]} onChange={(v) => setProduct((p) => ({ ...p, [field.key]: v }))} />
          ))}
        </div>
        <div className="grid gap-3 rounded-lg bg-stone-50 p-3 text-sm sm:grid-cols-4">
          <span>Kumaş: <strong>{preview.calc.fabricCm} cm</strong></span>
          <span>Kazan: <strong>{preview.calc.kazan} cm</strong></span>
          <span>Bobin başı: <strong>{Math.floor(Number(preview.calc.perRoll)).toLocaleString('tr-TR')} adet</strong></span>
          <span>Hedef: <strong>{Number(preview.calc.target).toLocaleString('tr-TR')} adet</strong></span>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Fiyat ve ödeme</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="Adet" hint="Boş bırakılırsa hedef adet" error={fe.quantity}><input inputMode="numeric" value={qtyOverride} onChange={(e) => setQtyOverride(e.target.value.replace(/\D/g, ''))} placeholder={String(preview.calc.target)} className={fieldClass} /></FormField>
          <FormField label="Birim fiyat" required error={fe.unitPrice}><input inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="8,75" className={`${fieldClass} text-right`} /></FormField>
          <FormField label="KDV %" required error={fe.vatRate}><input inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={`${fieldClass} text-right`} /></FormField>
          <FormField label="Para birimi">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={fieldClass}>
              <option value="TRY">TL (₺)</option><option value="USD">Dolar ($)</option><option value="EUR">Euro (€)</option>
            </select>
          </FormField>
          {currency !== 'TRY' && (
            <>
              <FormField label="Kur" required error={fe.fxRate}><input name="fxRate" inputMode="decimal" placeholder="41,2350" className={fieldClass} /></FormField>
              <FormField label="Kur tarihi" required error={fe.fxRateDate}><input name="fxRateDate" type="date" defaultValue={istanbulToday()} className={fieldClass} /></FormField>
            </>
          )}
          <FormField label="Peşinat" error={fe.deposit}><MoneyInput name="deposit" currency={currency} /></FormField>
        </div>
        <p className="text-lg">Toplam (KDV dahil): <strong className="tabular-nums">{preview.total || '—'}</strong></p>
      </section>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Paketleme ve bölüm notları</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Paket türü">
            <select name="packagingType" defaultValue="sack" className={fieldClass}>
              {Object.entries(PACKAGING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="Paket başına adet" error={fe['packaging.capacity']}><input name="packagingCapacity" inputMode="numeric" defaultValue="2000" className={fieldClass} /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {sector.stages.filter((s) => s.id !== 'turning').map((s) => (
            <FormField key={s.id} label={`${s.label} notu`} hint="Yalnızca bu bölüm görür"><textarea name={`note_${s.id}`} rows={2} className={fieldClass} /></FormField>
          ))}
        </div>
      </section>

      {create.error && <p role="alert" className="text-red-700">{create.error}</p>}
      <div className="sticky bottom-20 flex justify-end lg:bottom-4">
        <Button disabled={create.pending} className="shadow-lg">{create.pending ? 'Kaydediliyor…' : 'Siparişi kaydet'}</Button>
      </div>
    </form>
  );
}

function ProductField({ field, value, error, onChange }: { field: SectorField; value: string | boolean | undefined; error?: string; onChange: (v: string | boolean) => void }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;
  if (field.type === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-stone-200 px-3">
        <input type="checkbox" className="h-5 w-5" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {field.label}
      </label>
    );
  }
  return (
    <FormField label={label} required={field.required} hint={field.hint} error={error}>
      {field.type === 'select' ? (
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
          {field.options?.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input value={String(value ?? '')} inputMode={field.type === 'text' ? 'text' : 'decimal'} onChange={(e) => onChange(e.target.value)} className={fieldClass} />
      )}
    </FormField>
  );
}

function CustomerPicker({ value, onChange, error }: { value: { id: string; name: string } | null; onChange: (p: { id: string; name: string } | null) => void; error?: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; city: string }[]>([]);
  const [open, setOpen] = useState(false);

  async function search(text: string) {
    setQ(text);
    if (text.trim().length < 2) return setResults([]);
    const r = await searchCustomersAction({ q: text });
    if (r.ok) {
      setResults(r.data);
      setOpen(true);
    }
  }

  if (value) {
    return (
      <FormField label="Müşteri" required>
        <span className="flex items-center justify-between gap-2 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2.5">
          <strong>{value.name}</strong>
          <button type="button" onClick={() => onChange(null)} className="text-sm underline">Değiştir</button>
        </span>
      </FormField>
    );
  }
  // Etiket doğrudan arama kutusuna bağlanır (FormField çocuğu input olmalı); liste dışarıda.
  return (
    <div className="relative">
      <FormField label="Müşteri" required error={error} hint="En az 2 harf yazın">
        <input value={q} onChange={(e) => void search(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} role="combobox" aria-expanded={open} aria-autocomplete="list" className={fieldClass} />
      </FormField>
      {open && results.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button type="button" className="w-full px-3 py-2.5 text-left hover:bg-stone-100" onClick={() => { onChange(p); setOpen(false); }}>
                {p.name} <span className="text-sm text-stone-500">{p.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
