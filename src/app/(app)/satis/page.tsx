import { notFound } from 'next/navigation';
import { CALL_VIEWS, callList, salesStaffList, type CallView } from '@/modules/sales/server/queries';
import { CallList } from '@/modules/sales/ui/call-list';
import { requireSalesPage } from '@/modules/sales/ui/guard';

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ gorunum?: string; sorumlu?: string }> }) {
  await requireSalesPage();
  const { gorunum, sorumlu } = await searchParams;
  const view: CallView = (CALL_VIEWS as readonly string[]).includes(gorunum ?? '') ? (gorunum as CallView) : 'today';
  const responsibleStaffId = /^[0-9a-f-]{36}$/.test(sorumlu ?? '') ? sorumlu : undefined;
  const [rows, today, overdue, staff] = await Promise.all([
    callList({ view, responsibleStaffId }),
    callList({ view: 'today', responsibleStaffId }),
    callList({ view: 'overdue', responsibleStaffId }),
    salesStaffList({}),
  ]);
  if (!rows.ok) notFound();
  return (
    <CallList
      rows={rows.data}
      view={view}
      responsible={responsibleStaffId ?? ''}
      counts={{ today: today.ok ? today.data.length : 0, overdue: overdue.ok ? overdue.data.length : 0 }}
      staff={staff.ok ? staff.data : []}
    />
  );
}
