import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import { buttonClasses } from '@/ui/button';

import { partyDetail } from '@/core/parties/service';
import { accountOptions, partyLedger } from '@/modules/finance/server/queries';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { PartyLedger } from '@/modules/finance/ui/party-ledger';
import { PageHeader } from '@/ui/page-header';

export default async function PartyLedgerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bas?: string }> }) {
  await requireFinancePage();
  const { id } = await params;
  const { bas } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const from = bas && /^\d{4}-\d{2}-\d{2}$/.test(bas) ? bas : undefined;
  const [p, l, accounts] = await Promise.all([partyDetail({ id }), partyLedger({ partyId: id, from }), accountOptions({})]);
  if (!p.ok || !l.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/muhasebe/cariler" className="hover:underline">Cari bakiyeler</Link>}
        title={p.data.name}
        actions={<a href={`/api/disa-aktar/muhasebe?tur=ekstre&cari=${id}${from ? `&bas=${from}` : ''}`} className={buttonClasses('secondary')}><FileSpreadsheet aria-hidden className="h-4 w-4" /> Excel&apos;e aktar</a>}
        description={<>Cari ekstresi ve açık kalemler. <Link href={`/cariler/${id}`} className="font-medium text-stone-800 underline">Cari kartını aç</Link></>}
      />
      <PartyLedger party={{ id, name: p.data.name }} kind={p.data.kind} ledger={l.data} accounts={accounts.ok ? accounts.data : []} from={from ?? ''} />
    </div>
  );
}
