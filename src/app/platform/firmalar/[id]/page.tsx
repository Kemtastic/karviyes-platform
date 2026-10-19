import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/core/dates';
import { FEATURES } from '@/core/features';
import { MANIFESTS } from '@/core/modules/registry';
import { MODULE_IDS, ROLES } from '@/core/modules/types';
import { platformAuditList, platformCompany } from '@/core/platform/companies';
import { platformCompanyAudit, platformCompanyUsage, platformCompanyUsers } from '@/core/platform/insight';
import { navFor } from '@/core/nav';
import { getInstallConfig, parseInstallConfig } from '@/core/install-config';
import { getSector, roleLabelsFor, SECTOR_IDS } from '@/sectors';
import { PageHeader } from '@/ui/page-header';
import { CompanySettingsForm } from './settings-form';
import { InstallTokenButton } from './install-token';
import { SupportViewButton } from './support-view';
import { UsersTable } from './users-table';

const AREA: Record<string, string> = { orders: 'Sipariş', production: 'Üretim', sales: 'Satış', finance: 'Ön muhasebe', users: 'Kullanıcılar', staff: 'Personel', parties: 'Cariler', company: 'Firma ayarları', platform: 'Merkez panel' };
const H2 = 'text-[15px] font-semibold text-stone-900';

export default async function PlatformCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [r, log, users, usage, audit] = await Promise.all([
    platformCompany({ id }), platformAuditList({ companyId: id, limit: 50 }), platformCompanyUsers({ companyId: id }), platformCompanyUsage({ companyId: id }), platformCompanyAudit({ companyId: id, limit: 50 }),
  ]);
  if (!r.ok) notFound();
  const c = r.data;
  const labels = roleLabelsFor(c.config.sector);
  // Rol–ekran tablosu: firmanın açık modüllerine göre her rolün menüsünde ne var.
  const cfg = parseInstallConfig({ ...getInstallConfig(), modules: c.config.modules, sector: c.config.sector });
  const screens = navFor([...ROLES], cfg);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={<Link href="/platform" className="hover:underline">Firmalar</Link>} title={c.name} description={`${c.slug} · ${c.activeUsers} aktif kullanıcı`} actions={<><a href={`/api/platform/disa-aktar/${c.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50">Veriyi indir (JSON)</a><InstallTokenButton companyId={c.id} /><SupportViewButton companyId={c.id} roles={ROLES.map((role) => ({ id: role, label: labels[role] }))} /></>} />
      <CompanySettingsForm
        company={c}
        modules={MODULE_IDS.map((m) => ({ id: m, name: MANIFESTS[m].name, dependsOn: [...MANIFESTS[m].dependsOn] }))}
        sectors={SECTOR_IDS.map((s) => ({ id: s, name: getSector(s).name }))}
        roles={ROLES.map((role) => ({ id: role, label: labels[role] }))}
        features={FEATURES.map((f) => ({ key: f.key, module: f.module, label: f.label, hint: f.hint, default: f.default }))}
      />
      <section className="space-y-2">
        <h2 className={H2}>Kullanıcılar</h2>
        {users.ok && <UsersTable companyId={c.id} members={users.data} roleLabels={labels} />}
      </section>
      {usage.ok && (
        <section className="space-y-2">
          <h2 className={H2}>Son 30 gün</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-xl border border-stone-200 bg-white px-3 py-2">İşlem yapan kişi: <b className="tabular-nums">{usage.data.activeActors}</b></span>
            {Object.entries(usage.data.byArea).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <span key={k} className="rounded-xl border border-stone-200 bg-white px-3 py-2">{AREA[k] ?? k}: <b className="tabular-nums">{n}</b></span>
            ))}
            {!Object.keys(usage.data.byArea).length && <span className="text-stone-500">Son 30 günde işlem yok.</span>}
          </div>
        </section>
      )}
      <section className="space-y-2">
        <h2 className={H2}>Rol – ekran tablosu</h2>
        <p className="text-sm text-stone-500">Açık modüllere göre her rolün menüsünde görünen ekranlar. Modül kapatılınca satırları buradan da kalkar.</p>
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-xs text-stone-500">
              <tr><th className="px-3 py-2 text-left font-semibold">Ekran</th>{ROLES.map((role) => <th key={role} className="px-2 py-2 text-center font-semibold">{labels[role]}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {screens.map((s) => (
                <tr key={s.href}>
                  <td className="whitespace-nowrap px-3 py-2">{s.label}<span className="ml-2 font-mono text-xs text-stone-400">{s.href}</span></td>
                  {ROLES.map((role) => <td key={role} className="px-2 py-2 text-center">{s.roles.includes(role) ? <span aria-label="görür" className="text-emerald-700">●</span> : <span aria-label="görmez" className="text-stone-300">·</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-2">
        <h2 className={H2}>Firma denetim kaydı (son 50)</h2>
        <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white text-sm shadow-[var(--shadow-card)]">
          {audit.ok && audit.data.map((a) => (
            <li key={a.id} className="px-4 py-2.5">
              <span className="tabular-nums text-stone-500">{formatDateTime(new Date(a.at))}</span> · {a.actorName ?? 'Sistem'} · <span className="font-mono text-xs">{a.action}</span> <span className="text-stone-500">{a.entity} {a.entityId}</span>
            </li>
          ))}
          {audit.ok && !audit.data.length && <li className="px-4 py-6 text-center text-stone-500">Henüz kayıt yok.</li>}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className={H2}>Bu firmadaki panel işlemleri</h2>
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
