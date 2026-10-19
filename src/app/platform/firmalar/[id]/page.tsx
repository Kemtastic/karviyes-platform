import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/core/dates';
import { FEATURES } from '@/core/features';
import { MANIFESTS } from '@/core/modules/registry';
import { MODULE_IDS, ROLES } from '@/core/modules/types';
import { platformAuditList, platformCompany } from '@/core/platform/companies';
import { getSector, roleLabelsFor, SECTOR_IDS } from '@/sectors';
import { PageHeader } from '@/ui/page-header';
import { CompanySettingsForm } from './settings-form';

export default async function PlatformCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [r, log] = await Promise.all([platformCompany({ id }), platformAuditList({ companyId: id, limit: 50 })]);
  if (!r.ok) notFound();
  const c = r.data;
  const labels = roleLabelsFor(c.config.sector);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={<Link href="/platform" className="hover:underline">Firmalar</Link>} title={c.name} description={`${c.slug} · ${c.activeUsers} aktif kullanıcı`} />
      <CompanySettingsForm
        company={c}
        modules={MODULE_IDS.map((m) => ({ id: m, name: MANIFESTS[m].name, dependsOn: [...MANIFESTS[m].dependsOn] }))}
        sectors={SECTOR_IDS.map((s) => ({ id: s, name: getSector(s).name }))}
        roles={ROLES.map((role) => ({ id: role, label: labels[role] }))}
        features={FEATURES.map((f) => ({ key: f.key, module: f.module, label: f.label, hint: f.hint, default: f.default }))}
      />
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-stone-900">Bu firmadaki panel işlemleri</h2>
        <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white text-sm shadow-[var(--shadow-card)]">
          {log.ok && log.data.map((a) => (
            <li key={a.id} className="px-4 py-2.5">
              <span className="tabular-nums text-stone-500">{formatDateTime(new Date(a.at))}</span> · {a.action}{' '}
              <span className="break-all font-mono text-xs text-stone-500">{JSON.stringify((a.detail as { after?: unknown }).after ?? {})}</span>
            </li>
          ))}
          {log.ok && !log.data.length && <li className="px-4 py-6 text-center text-stone-500">Henüz panel işlemi yok.</li>}
        </ul>
      </section>
    </div>
  );
}
