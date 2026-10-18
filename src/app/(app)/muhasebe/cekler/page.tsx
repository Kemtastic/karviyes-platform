import { notFound } from 'next/navigation';
import { istanbulToday } from '@/core/dates';
import { formatMoney, money, type Currency } from '@/core/money';
import { accountOptions, checksList } from '@/modules/finance/server/queries';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { ChecksTable } from '@/modules/finance/ui/lists';
import { FinanceToolbar } from '@/modules/finance/ui/toolbar';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';

export default async function ChecksPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  await requireFinancePage();
  const d = (await searchParams).durum;
  const status = d === 'kapali' ? 'closed' : d === 'tumu' ? 'all' : 'open';
  const [r, open, accounts] = await Promise.all([checksList({ status }), checksList({ status: 'open' }), accountOptions({})]);
  if (!r.ok) notFound();
  const sum = (dir: string) => {
    const m = new Map<Currency, bigint>();
    for (const c of open.ok ? open.data : []) if (c.direction === dir) m.set(c.currency, (m.get(c.currency) ?? 0n) + BigInt(c.amount));
    return [...m].map(([c, v]) => formatMoney(money(v, c))).join(' · ') || '—';
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Çekler"
        description="Müşteriden alınan çekler portföyde bekler; tahsil edilir, tedarikçiye ciro edilir ya da iade olur. Verdiğimiz çekler vadesinde bankadan ödenir."
        actions={<FinanceToolbar actions={['checkIn', 'checkOut']} accounts={accounts.ok ? accounts.data : []} />}
      />
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--brand)_30%,white)] bg-[var(--brand-softer)] p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Portföyde</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{sum('received')}</p>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Ödenecek (verilen)</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{sum('issued')}</p>
        </div>
      </section>
      <LinkTabs label="Çek durumu" items={[
        { href: '/muhasebe/cekler', label: 'Açık', active: status === 'open', count: open.ok ? open.data.length : 0 },
        { href: '/muhasebe/cekler?durum=kapali', label: 'Kapanan', active: status === 'closed' },
        { href: '/muhasebe/cekler?durum=tumu', label: 'Tümü', active: status === 'all' },
      ]} />
      <ChecksTable rows={r.data} accounts={accounts.ok ? accounts.data : []} today={istanbulToday()} />
    </div>
  );
}
