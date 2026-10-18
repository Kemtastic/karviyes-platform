import { notFound } from 'next/navigation';
import { partyDetail } from '@/core/parties/service';
import { reconciliationsList } from '@/modules/finance/server/reconciliation';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { ReconciliationList } from '@/modules/finance/ui/reconciliation';
import { PageHeader } from '@/ui/page-header';

export default async function ReconciliationsPage({ searchParams }: { searchParams: Promise<{ cari?: string }> }) {
  await requireFinancePage();
  const { cari } = await searchParams;
  const partyId = cari && /^[0-9a-f-]{36}$/.test(cari) ? cari : undefined;
  const [r, p] = await Promise.all([reconciliationsList({}), partyId ? partyDetail({ id: partyId }) : null]);
  if (!r.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Cari mutabakat"
        description="Seçilen tarihteki bakiye dondurulur ve karşı tarafa güvenli bir bağlantıyla gönderilir; karşı taraf giriş yapmadan ekstreyi görür ve mutabık olup olmadığını bildirir."
      />
      <ReconciliationList rows={r.data} initialParty={p?.ok ? { id: p.data.id, name: p.data.name } : null} />
    </div>
  );
}
