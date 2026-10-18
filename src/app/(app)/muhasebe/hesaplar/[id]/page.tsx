import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney, money } from '@/core/money';
import { accountOptions, accountStatement } from '@/modules/finance/server/queries';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { MOVEMENT_LABELS, MOVEMENT_TONES } from '@/modules/finance/ui/labels';
import { FinanceToolbar } from '@/modules/finance/ui/toolbar';
import { Badge } from '@/ui/badge';
import { DateText } from '@/ui/date-text';
import { PageHeader } from '@/ui/page-header';

export default async function AccountStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bas?: string }> }) {
  await requireFinancePage();
  const { id } = await params;
  const { bas } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const from = bas && /^\d{4}-\d{2}-\d{2}$/.test(bas) ? bas : undefined;
  const [r, accounts] = await Promise.all([accountStatement({ id, from }), accountOptions({})]);
  if (!r.ok || !r.data) notFound();
  const { account: a, rows } = r.data;
  const fm = (v: string) => formatMoney(money(v, a.currency));
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/muhasebe/hesaplar" className="hover:underline">Kasa ve banka</Link>}
        title={a.name}
        description={<>{a.kind === 'cash' ? 'Kasa' : a.bank || 'Banka'} · {a.currency}{a.iban && <span className="ml-2 font-mono text-xs">{a.iban}</span>} · açılış {fm(a.opening)} (<DateText value={a.openingDate} />)</>}
        actions={<FinanceToolbar actions={['collection', 'payment', 'expense', 'transfer']} accounts={accounts.ok ? accounts.data : []} />}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)] px-5 py-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Güncel bakiye</p>
          <p className="text-2xl font-semibold tabular-nums">{fm(r.data.balance)}</p>
        </div>
        <form className="flex items-end gap-2">
          <label className="flex flex-col text-xs font-medium text-stone-600">Başlangıç<input type="date" name="bas" defaultValue={from} className="mt-1 min-h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm shadow-sm" /></label>
          <button className="min-h-10 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white">Göster</button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Tarih</th><th className="px-4 py-3 text-left font-semibold">Tür</th><th className="px-4 py-3 text-left font-semibold">Açıklama</th>
              <th className="px-4 py-3 text-right font-semibold">Giriş</th><th className="px-4 py-3 text-right font-semibold">Çıkış</th><th className="px-4 py-3 text-right font-semibold">Bakiye</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((m) => (
              <tr key={m.id} className={m.reversed ? 'text-stone-400' : 'hover:bg-stone-50/70'}>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums"><DateText value={m.date} /></td>
                <td className="px-4 py-2.5"><Badge tone={m.reversed ? 'muted' : MOVEMENT_TONES[m.kind]} dot={false}>{MOVEMENT_LABELS[m.kind]}{m.reversed ? ' · iptal' : ''}</Badge></td>
                <td className="px-4 py-2.5">
                  {m.partyId ? <Link href={`/muhasebe/cariler/${m.partyId}`} className="font-medium hover:underline">{m.partyName}</Link> : m.category}
                  {m.note && <span className="block text-xs text-stone-500">{m.note}</span>}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${m.reversed ? 'line-through' : 'text-emerald-700'}`}>{m.direction === 'in' ? fm(m.amount) : ''}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${m.reversed ? 'line-through' : ''}`}>{m.direction === 'out' ? fm(m.amount) : ''}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fm(m.balance)}</td>
              </tr>
            ))}
            <tr className="bg-stone-50/60 text-stone-600">
              <td className="whitespace-nowrap px-4 py-2.5">{!from && <DateText value={a.openingDate} />}</td>
              <td />
              <td className="px-4 py-2.5 italic">{from ? 'Önceki dönemden devir' : 'Açılış bakiyesi'}</td>
              <td />
              <td />
              <td className="px-4 py-2.5 text-right tabular-nums">{fm(from ? r.data.carried : a.opening)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
