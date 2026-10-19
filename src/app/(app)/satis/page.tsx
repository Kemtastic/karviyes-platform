import { notFound } from 'next/navigation';
import { CALL_VIEWS, callList, salesStaffList, type CallView } from '@/modules/sales/server/queries';
import { CallList } from '@/modules/sales/ui/call-list';
import { requireSalesPage } from '@/modules/sales/ui/guard';
import { PRIORITIES } from '@/modules/sales/db/schema';

type Params = { gorunum?: string; sorumlu?: string; oncelik?: string; eski?: string; q?: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireSalesPage();
  const { gorunum, sorumlu, oncelik, eski, q } = await searchParams;
  const view: CallView = (CALL_VIEWS as readonly string[]).includes(gorunum ?? '') ? (gorunum as CallView) : 'today';
  const responsibleStaffId = /^[0-9a-f-]{36}$/.test(sorumlu ?? '') ? sorumlu : undefined;
  const unassigned = sorumlu === 'yok' || undefined;
  const priority = (PRIORITIES as readonly string[]).includes(oncelik ?? '') ? (oncelik as (typeof PRIORITIES)[number]) : undefined;
  const staleDays = ['30', '60', '90', '180'].includes(eski ?? '') ? Number(eski) : undefined;
  const search = q?.trim().slice(0, 100) || undefined;
  const [rows, today, overdue, staff] = await Promise.all([
    callList({ view, responsibleStaffId, unassigned, priority, staleDays, q: search }),
    callList({ view: 'today', responsibleStaffId }),
    callList({ view: 'overdue', responsibleStaffId }),
    salesStaffList({}),
  ]);
  if (!rows.ok) notFound();
  return (
    <CallList
      rows={rows.data}
      view={view}
      responsible={unassigned ? 'yok' : (responsibleStaffId ?? '')}
      filters={{ oncelik: priority ?? '', eski: staleDays ? String(staleDays) : '', q: search ?? '' }}
      isAdmin={user.roles.includes('admin')}
      counts={{ today: today.ok ? today.data.length : 0, overdue: overdue.ok ? overdue.data.length : 0 }}
      staff={staff.ok ? staff.data : []}
    />
  );
}
