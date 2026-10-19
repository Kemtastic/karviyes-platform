import { notFound } from 'next/navigation';
import { getConfig } from '@/core/company/config';
import { BOARD_TABS, productionBoard, type BoardTab } from '@/modules/production/server/queries';
import { BoardScreen } from '@/modules/production/ui/board';
import { requireProductionPage } from '@/modules/production/ui/guard';

export default async function ProductionBoardPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const user = await requireProductionPage(['admin', 'tracking', 'sales']);
  const { sekme } = await searchParams;
  const tab: BoardTab = (BOARD_TABS as readonly string[]).includes(sekme ?? '') ? (sekme as BoardTab) : 'production';
  const r = await productionBoard({ tab });
  if (!r.ok) notFound();
  return <BoardScreen tab={tab} data={r.data} sector={(await getConfig()).sector} canManage={user.roles.some((x) => x === 'admin' || x === 'tracking')} />;
}
