'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { istanbulToday } from '@/core/dates';
import { formatMoney, money, type Currency } from '@/core/money';
import { getSector } from '@/sectors';
import type { SectorField, SectorPackage } from '@/sectors/types';
import { Button } from '@/ui/button';
import { FormField, fieldClass } from '@/ui/form-field';
import { MoneyInput } from '@/ui/money-input';
import { useAction } from '@/ui/use-action';
import { createOrderAction, lastOrderLinesAction, searchCustomersAction, updateOrderAction } from './actions';
import { computeOrderTotal, parseRate, parseUnitPrice } from '../domain/totals';
import { PACKAGING_LABELS } from '../domain/packaging';

const MAX_LINES = 20;

type InitialLine = { product: Record<string, unknown>; quantity: number; unitPrice: string; vatRate: string; packaging: { type: string; capacity: number }; departmentNotes: Record<string, string> };

// Taslak sipariş düzenlenirken formun başlangıç değerleri (kayıtlı hâliyle).
export type OrderInitial = {
  id: string;
  version: number;
  party: { id: string; name: string };
  salespersonStaffId: string | null;
  orderDate: string;
  currency: Currency;
  fxRate: string | null;
  fxRateDate: string | null;
  lines: InitialLine[];
};

type Props = { sector: string; salesStaff: { id: string; name: string }[]; initial?: OrderInitial };

type LineState = {
  key: number;
  product: Record<string, string | boolean>;
  qtyOverride: string;
  unitPrice: string;
  vatRate: string;
  packagingType: string;
  packagingCapacity: string;
  notes: Record<string, string>;
};

// "8.7500" → "8,75"
const decimalText = (v: string | null) => (v ? v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',') : '');

function productState(p: Record<string, unknown>): Record<string, string | boolean> {
  const out = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v ?? '')]));
  return { ...out, biyeType: p.biyeType === 'without' ? 'Biyesiz' : 'Biyeli' };
}

const productInput = (p: Record<string, string | boolean>) => ({ ...p, biyeType: p.biyeType === 'Biyesiz' ? 'without' : 'with' });

let nextKey = 1;

function emptyLine(): LineState {
  return {
    key: nextKey++,
    product: { shape: 'Körüksüz', handle: 'El Geçme', biyeType: 'Biyeli', gusset: '0', biye: '5', colour: 'Beyaz' },
    qtyOverride: '', unitPrice: '', vatRate: '10', packagingType: 'sack', packagingCapacity: '2000', notes: {},
  };
}

function lineFromInitial(l: InitialLine, sector: SectorPackage): LineState {
  return {
    key: nextKey++,
    product: productState(l.product),
    // Kayıtlı adet hesaplanan hedeften farklıysa elle girilmiş sayılır.
    qtyOverride: l.quantity !== Number(sector.targetQuantity(l.product)) ? String(l.quantity) : '',
    unitPrice: decimalText(l.unitPrice),
    vatRate: decimalText(l.vatRate) || '0',
    packagingType: l.packaging.type,
    packagingCapacity: String(l.packaging.capacity),
    notes: l.departmentNotes,
  };
}

// Satırın hesap önizlemesi: hedef adet ve KDV dahil tutar (kuruş).
function linePreview(sector: SectorPackage, l: LineState, currency: Currency) {
  const calc = sector.calculate(productInput(l.product)) as Record<string, number>;
  const target = Number(l.qtyOverride) || Number(calc.target) || 0;
  let totalMinor: bigint | null = null;
  try {
    if (l.unitPrice && target) totalMinor = computeOrderTotal(parseUnitPrice(l.unitPrice), target, parseRate(l.vatRate, 'vatRate', 'KDV'), currency).minor;
  } catch {
    totalMinor = null;
  }
  return { calc, target, totalMinor };
}

export function OrderForm({ sector: sectorId, salesStaff, initial }: Props) {
  const router = useRouter();
  const sector = getSector(sectorId);
  const [party, setParty] = useState<{ id: string; name: string } | null>(initial?.party ?? null);
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'TRY');
  const [lines, setLines] = useState<LineState[]>(() => (initial ? initial.lines.map((l) => lineFromInitial(l, sector)) : [emptyLine()]));
  const create = useAction(createOrderAction);
  const update = useAction(updateOrderAction);
  const action = initial ? update : create;
  const fe = action.fieldErrors;

  const previews = useMemo(() => lines.map((l) => linePreview(sector, l, currency)), [lines, currency, sector]);
  const grandTotal = previews.every((p) => p.totalMinor !== null) ? formatMoney(money(previews.reduce((s, p) => s + (p.totalMinor ?? 0n), 0n), currency)) : '';

  // Tekrarlayan siparişler için müşterinin son siparişindeki ürünler ve fiyatlar forma alınır.
  const [copyNote, setCopyNote] = useState('');
  async function copyLastOrder() {
    if (!party) return;
    const r = await lastOrderLinesAction({ partyId: party.id });
    if (!r.ok) return setCopyNote(r.message);
    if (!r.data || !r.data.lines.length) return setCopyNote('Bu müşterinin önceki siparişi yok.');
    setLines(r.data.lines.map((l) => lineFromInitial(l, sector)));
    setCopyNote(`${r.data.no} numaralı siparişin ürünleri getirildi; adet ve fiyatları kontrol edin.`);
  }

  const patchLine = (key: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const input = {
      partyId: party?.id ?? '',
      salespersonStaffId: f.salespersonStaffId,
      orderDate: f.orderDate,
      currency,
      fxRate: f.fxRate || undefined,
      fxRateDate: f.fxRateDate || undefined,
      deposit: f.deposit,
      lines: lines.map((l) => ({
        product: productInput(l.product),
        quantity: l.qtyOverride ? Number(l.qtyOverride) : undefined,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        packaging: { type: l.packagingType, capacity: Number(l.packagingCapacity || 0) },
        departmentNotes: l.notes,
      })),
    };
    const done = (d: { id: string }) => router.push(`/siparisler/${d.id}`);
    if (initial) update.run({ ...input, deposit: undefined, id: initial.id, version: initial.version }, done);
    else create.run(input, done);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Müşteri</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><CustomerPicker value={party} onChange={setParty} error={fe.partyId} /></div>
          <FormField label="Sipariş tarihi" required error={fe.orderDate}><input type="date" name="orderDate" defaultValue={initial?.orderDate ?? istanbulToday()} className={fieldClass} /></FormField>
          <FormField label="Satış yapan" required error={fe.salespersonStaffId}>
            <select name="salespersonStaffId" className={fieldClass} defaultValue={initial?.salespersonStaffId ?? ''}>
              <option value="" disabled>Seçin</option>
              {salesStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
          <FormField label="Para birimi">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={fieldClass}>
              <option value="TRY">TL (₺)</option><option value="USD">Dolar ($)</option><option value="EUR">Euro (€)</option>
            </select>
          </FormField>
          {currency !== 'TRY' && (
            <>
              <FormField label="Kur" required error={fe.fxRate}><input name="fxRate" inputMode="decimal" placeholder="41,2350" defaultValue={decimalText(initial?.fxRate ?? null)} className={fieldClass} /></FormField>
              <FormField label="Kur tarihi" required error={fe.fxRateDate}><input name="fxRateDate" type="date" defaultValue={initial?.fxRateDate ?? istanbulToday()} className={fieldClass} /></FormField>
            </>
          )}
        </div>
        {party && !initial && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void copyLastOrder()}>Son siparişten ürünleri getir</Button>
            {copyNote && <p role="status" className="text-sm text-stone-700">{copyNote}</p>}
          </div>
        )}
        {!salesStaff.length && <p className="text-sm text-amber-800">Satış personeli tanımlı değil. Ayarlar → Personel bölümünden “Satış” bölümüyle personel ekleyin.</p>}
      </section>

      {lines.map((l, n) => (
        <LineEditor
          key={l.key}
          index={n}
          count={lines.length}
          line={l}
          preview={previews[n]!}
          currency={currency}
          sector={sector}
          errors={fe}
          onChange={(patch) => patchLine(l.key, patch)}
          onRemove={() => {
            action.clearErrors();
            setLines((ls) => ls.filter((x) => x.key !== l.key));
          }}
        />
      ))}
      {fe.lines && <p role="alert" className="text-red-700">{fe.lines}</p>}
      <UnplacedLineErrors errors={fe} lineCount={lines.length} />
      {lines.length < MAX_LINES && (
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>Ürün ekle</Button>
      )}

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Toplam ve ödeme</h2>
        <p className="text-lg">Sipariş toplamı (KDV dahil): <strong className="tabular-nums">{grandTotal || '—'}</strong></p>
        {!initial && <div className="max-w-xs"><FormField label="Peşinat" error={fe.deposit}><MoneyInput name="deposit" currency={currency} /></FormField></div>}
      </section>

      {action.error && <p role="alert" className="text-red-700">{action.error}</p>}
      <div className="sticky bottom-20 flex justify-end lg:bottom-4">
        <Button disabled={action.pending} className="shadow-lg">{action.pending ? 'Kaydediliyor…' : initial ? 'Değişiklikleri kaydet' : 'Siparişi kaydet'}</Button>
      </div>
    </form>
  );
}

type LineEditorProps = {
  index: number;
  count: number;
  line: LineState;
  preview: ReturnType<typeof linePreview>;
  currency: Currency;
  sector: SectorPackage;
  errors: Record<string, string | undefined>;
  onChange: (patch: Partial<LineState>) => void;
  onRemove: () => void;
};

function LineEditor({ index, count, line: l, preview, currency, sector, errors, onChange, onRemove }: LineEditorProps) {
  const err = (k: string) => errors[`lines.${index}.${k}`];
  const title = count > 1 ? `Ürün ${index + 1}` : 'Ürün';
  return (
    <section aria-label={title} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {count > 1 && <Button type="button" variant="ghost" onClick={onRemove}>Ürünü kaldır</Button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {sector.productFields.map((field) => (
          <ProductField key={field.key} field={field} value={l.product[field.key]} error={err(`product.${field.key}`)} onChange={(v) => onChange({ product: { ...l.product, [field.key]: v } })} />
        ))}
      </div>
      <div className="grid gap-3 rounded-lg bg-stone-50 p-3 text-sm sm:grid-cols-4">
        <span>Kumaş: <strong>{preview.calc.fabricCm} cm</strong></span>
        <span>Kazan: <strong>{preview.calc.kazan} cm</strong></span>
        <span>Bobin başı: <strong>{Math.floor(Number(preview.calc.perRoll)).toLocaleString('tr-TR')} adet</strong></span>
        <span>Hedef: <strong>{Number(preview.calc.target).toLocaleString('tr-TR')} adet</strong></span>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <FormField label="Adet" hint="Boş bırakılırsa hedef adet" error={err('quantity')}><input inputMode="numeric" value={l.qtyOverride} onChange={(e) => onChange({ qtyOverride: e.target.value.replace(/\D/g, '') })} placeholder={String(preview.calc.target)} className={fieldClass} /></FormField>
        <FormField label="Birim fiyat" required error={err('unitPrice')}><input inputMode="decimal" value={l.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} placeholder="8,75" className={`${fieldClass} text-right`} /></FormField>
        <FormField label="KDV %" required error={err('vatRate')}><input inputMode="decimal" value={l.vatRate} onChange={(e) => onChange({ vatRate: e.target.value })} className={`${fieldClass} text-right`} /></FormField>
        <div className="self-end pb-2.5 text-right">
          <span className="block text-sm text-stone-500">Tutar (KDV dahil)</span>
          <strong className="tabular-nums">{preview.totalMinor !== null ? formatMoney(money(preview.totalMinor, currency)) : '—'}</strong>
        </div>
        <FormField label="Paket türü">
          <select value={l.packagingType} onChange={(e) => onChange({ packagingType: e.target.value })} className={fieldClass}>
            {Object.entries(PACKAGING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FormField>
        <FormField label="Paket başına adet" error={err('packaging.capacity')}><input inputMode="numeric" value={l.packagingCapacity} onChange={(e) => onChange({ packagingCapacity: e.target.value.replace(/\D/g, '') })} className={fieldClass} /></FormField>
      </div>
      <details className="rounded-lg border border-stone-200 p-3" open={Object.values(l.notes).some(Boolean)}>
        <summary className="cursor-pointer text-sm font-medium">Bölüm notları</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {sector.stages.filter((s) => s.id !== 'turning').map((s) => (
            <FormField key={s.id} label={`${s.label} notu`} hint="Yalnızca bu bölüm görür">
              <textarea rows={2} value={l.notes[s.id] ?? ''} onChange={(e) => onChange({ notes: { ...l.notes, [s.id]: e.target.value } })} className={fieldClass} />
            </FormField>
          ))}
        </div>
      </details>
    </section>
  );
}

// Satır kartında alanı olmayan satır hataları (ör. bölüm notu uzunluğu) kaybolmasın diye listelenir.
const PLACED = /^lines\.\d+\.(product\.|quantity$|unitPrice$|vatRate$|packaging\.capacity$)/;

function UnplacedLineErrors({ errors, lineCount }: { errors: Record<string, string | undefined>; lineCount: number }) {
  const rest = Object.entries(errors).filter(([k, v]) => v && /^lines\.\d+\./.test(k) && !PLACED.test(k));
  if (!rest.length) return null;
  return (
    <ul role="alert" className="list-disc pl-5 text-red-700">
      {rest.map(([k, v]) => {
        const n = Number(k.split('.')[1]);
        return <li key={k}>{lineCount > 1 ? `Ürün ${n + 1}: ` : ''}{v}</li>;
      })}
    </ul>
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
