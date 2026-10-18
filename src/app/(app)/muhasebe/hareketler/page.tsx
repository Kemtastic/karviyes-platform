import { notFound } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import { buttonClasses } from '@/ui/button';

import { istanbulToday } from '@/core/dates';
import { accountOptions, movementsList } from '@/modules/finance/server/queries';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { MovementsTable } from '@/modules/finance/ui/lists';
import { FinanceToolbar } from '@/modules/finance/ui/toolbar';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { LinkTabs } from '@/ui/link-tabs';
import { PageHeader } from '@/ui/page-header';

const KINDS = { tahsilat: 'collection', odeme: 'payment', masraf: 'expense', gelir: 'income', virman: 'transfer', cek: 'check' } as const;
const LABELS: Record<string, string> = { tahsilat: 'Tahsilat', odeme: 'Ödeme', masraf: 'Masraf', gelir: 'Diğer gelir', virman: 'Virman', cek: 'Çek' };
const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export default async function MovementsPage({ searchParams }: { searchParams: Promise<{ tur?: string; bas?: string; bit?: string }> }) {
  await requireFinancePage();
  const sp = await searchParams;
  const key = sp.tur && sp.tur in KINDS ? (sp.tur as keyof typeof KINDS) : undefined;
  const today = istanbulToday();
  const from = isDate(sp.bas) ? sp.bas! : `${today.slice(0, 7)}-01`;
  const to = isDate(sp.bit) ? sp.bit! : today;
  const [r, accounts] = await Promise.all([movementsList({ kind: key ? KINDS[key] : undefined, from, to }), accountOptions({})]);
  if (!r.ok) notFound();
  const q = (tur?: string) => `/muhasebe/hareketler?${new URLSearchParams({ ...(tur ? { tur } : {}), bas: from, bit: to })}`;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Tahsilat ve ödemeler"
        description="Kasa ve bankaya giren çıkan her hareket. Yanlış kayıt silinmez; iptal edilir ve bakiyeden düşer."
        actions={<><FinanceToolbar actions={['collection', 'payment', 'expense', 'income', 'transfer']} accounts={accounts.ok ? accounts.data : []} /><a href={`/api/disa-aktar/muhasebe?tur=hareketler&bas=${from}&bit=${to}`} className={buttonClasses('secondary')}><FileSpreadsheet aria-hidden className="h-4 w-4" /> Excel&apos;e aktar</a></>}
      />
      <LinkTabs label="Hareket türü" items={[{ href: q(), label: 'Tümü', active: !key }, ...Object.keys(KINDS).map((k) => ({ href: q(k), label: LABELS[k]!, active: key === k }))]} />
      <FilterBar>
        {key && <input type="hidden" name="tur" value={key} />}
        <FilterField label="Başlangıç"><input type="date" name="bas" defaultValue={from} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="bit" defaultValue={to} className={filterInputClass} /></FilterField>
        <button className={filterButtonClass}>Göster</button>
      </FilterBar>
      <MovementsTable rows={r.data} />
    </div>
  );
}
