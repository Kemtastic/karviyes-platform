import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getInstallConfig } from '@/core/install-config';
import { DEPARTMENT_ROLES } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { requireProductionPage } from '@/modules/production/ui/guard';

export default async function DepartmentIndexPage() {
  const user = await requireProductionPage(['admin', 'tracking', ...DEPARTMENT_ROLES]);
  const stages = getSector(getInstallConfig().sector).stages;
  // Bölüm hesabı doğrudan kendi ekranına gider.
  const own = stages.find((s) => user.roles.includes(s.role) && !user.roles.some((r) => r === 'admin' || r === 'tracking'));
  if (own) redirect(`/uretim/bolum/${own.id}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Bölüm ekranları</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {stages.map((s) => (
          <Link key={s.id} href={`/uretim/bolum/${s.id}`} className="rounded-xl border border-stone-200 bg-white p-6 text-lg font-semibold shadow-sm hover:border-[var(--brand)]">{s.label}</Link>
        ))}
      </div>
    </div>
  );
}
