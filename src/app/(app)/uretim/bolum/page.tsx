import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getConfig } from '@/core/company/config';
import { DEPARTMENT_ROLES } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { requireProductionPage } from '@/modules/production/ui/guard';
import { Hammer, Layers, PackageCheck, Printer, RotateCcw, Scissors, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/ui/page-header';

const STAGE_ICONS: Record<string, LucideIcon> = { slitting: Layers, printing: Printer, cutting: Scissors, finishing: PackageCheck, repair: Hammer, turning: RotateCcw };

export default async function DepartmentIndexPage() {
  const user = await requireProductionPage(['admin', 'tracking', ...DEPARTMENT_ROLES]);
  const stages = getSector((await getConfig()).sector).stages;
  // Bölüm hesabı doğrudan kendi ekranına gider.
  const own = stages.find((s) => user.roles.includes(s.role) && !user.roles.some((r) => r === 'admin' || r === 'tracking'));
  if (own) redirect(`/uretim/bolum/${own.id}`);
  return (
    <div className="space-y-5">
      <PageHeader title="Bölüm ekranları" description="Her bölümün tabletinde açık duran iş listesi. Buradan herhangi bir bölümün ekranını izleyebilirsiniz." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((s) => {
          const Icon = STAGE_ICONS[s.id] ?? Hammer;
          return (
            <Link key={s.id} href={`/uretim/bolum/${s.id}`} className="group flex items-center gap-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)]"><Icon aria-hidden className="h-6 w-6" /></span>
              <span className="text-lg font-semibold">{s.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
