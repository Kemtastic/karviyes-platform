import Link from 'next/link';
import { notFound } from 'next/navigation';
import { reconciliationDetail } from '@/modules/finance/server/reconciliation';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { ReconciliationDetail } from '@/modules/finance/ui/reconciliation';
import { PageHeader } from '@/ui/page-header';

export default async function ReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFinancePage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await reconciliationDetail({ id });
  if (!r.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={<Link href="/muhasebe/mutabakat" className="hover:underline">Cari mutabakat · {r.data.no}</Link>} title={r.data.snapshot.partyName} />
      <ReconciliationDetail r={r.data} />
    </div>
  );
}
