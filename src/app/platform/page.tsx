import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/core/dates';
import { MANIFESTS } from '@/core/modules/registry';
import { platformCompanies } from '@/core/platform/companies';
import { MODULE_IDS } from '@/core/modules/types';
import { getSector, SECTOR_IDS } from '@/sectors';
import { NewCompany } from './new-company';
import { Badge } from '@/ui/badge';
import { PageHeader } from '@/ui/page-header';

export default async function PlatformHome() {
  const r = await platformCompanies({});
  if (!r.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Firmalar"
        description="Her firmanın sektörü, açık modülleri ve durumu. Firmaya tıklayınca ayarları açılır; her değişiklik panel kaydına ve firmanın denetim kaydına yazılır."
        actions={<NewCompany sectors={SECTOR_IDS.map((s) => ({ id: s, name: getSector(s).name }))} modules={MODULE_IDS.map((m) => ({ id: m, name: MANIFESTS[m].name, dependsOn: [...MANIFESTS[m].dependsOn] }))} />}
      />
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Firma</th><th className="px-4 py-3 text-left font-semibold">Sektör</th><th className="px-4 py-3 text-left font-semibold">Modüller</th>
              <th className="px-4 py-3 text-right font-semibold">Aktif kullanıcı</th><th className="px-4 py-3 text-left font-semibold">Son işlem</th><th className="px-4 py-3 text-left font-semibold">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.map((c) => (
              <tr key={c.id} className="hover:bg-stone-50/70">
                <td className="px-4 py-3"><Link href={`/platform/firmalar/${c.id}`} className="font-medium text-stone-900 hover:underline">{c.name}</Link><span className="block font-mono text-xs text-stone-500">{c.slug}</span></td>
                <td className="px-4 py-3">{getSector(c.sector).name}</td>
                <td className="px-4 py-3"><span className="flex flex-wrap gap-1">{c.modules.map((m) => <Badge key={m} tone="neutral" dot={false}>{MANIFESTS[m].name}</Badge>)}</span></td>
                <td className="px-4 py-3 text-right tabular-nums">{c.activeUsers}</td>
                <td className="px-4 py-3 text-stone-600">{c.lastActivity ? formatDateTime(new Date(c.lastActivity)) : '—'}</td>
                <td className="px-4 py-3"><Badge tone={c.status === 'active' ? 'success' : 'danger'}>{c.status === 'active' ? 'Aktif' : 'Askıda'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
