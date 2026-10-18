import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from '@/core/company/audit-labels';
import { AUDIT_PAGE_SIZE, listAudit } from '@/core/company/service';
import { formatDateTime } from '@/core/dates';
import { listMembers } from '@/core/users/queries';
import { Badge } from '@/ui/badge';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { PageHeader } from '@/ui/page-header';

type Search = { from?: string; to?: string; entity?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const r = await listAudit({ from: sp.from || undefined, to: sp.to || undefined, entity: sp.entity || undefined, page });
  if (!r.ok) notFound();
  // Kullanıcı kimliği yerine adı gösterilir (yalnızca bu firmanın üyeleri).
  const user = await getCurrentUser();
  const names = new Map(user ? (await listMembers(user.companyId)).map((m) => [m.userId, m.name]) : []);
  const pages = Math.max(1, Math.ceil(r.data.total / AUDIT_PAGE_SIZE));
  const qs = (p: number) => new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(sp.entity ? { entity: sp.entity } : {}), page: String(p) }).toString();
  const pager = 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-stone-50';

  return (
    <div className="space-y-5">
      <PageHeader title="Denetim kaydı" description="Sistemde yapılan her değişiklik kimin, ne zaman yaptığıyla birlikte değiştirilemez biçimde tutulur." />
      <FilterBar>
        <FilterField label="Başlangıç"><input type="date" name="from" defaultValue={sp.from} className={filterInputClass} /></FilterField>
        <FilterField label="Bitiş"><input type="date" name="to" defaultValue={sp.to} className={filterInputClass} /></FilterField>
        <FilterField label="Kayıt türü">
          <select name="entity" defaultValue={sp.entity ?? ''} className={`${filterInputClass} min-w-40`}>
            <option value="">Hepsi</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FilterField>
        <button className={filterButtonClass}>Filtrele</button>
      </FilterBar>
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-3 font-semibold">Zaman</th><th className="px-4 py-3 font-semibold">İşlem</th><th className="px-4 py-3 font-semibold">Kayıt</th><th className="px-4 py-3 font-semibold">Kullanıcı</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.rows.map((a) => (
              <tr key={a.id} className="hover:bg-stone-50/70">
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-stone-600">{formatDateTime(new Date(a.at))}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-stone-900">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <Badge tone="neutral" dot={false}>{AUDIT_ENTITY_LABELS[a.entity] ?? a.entity}</Badge>
                    <span className="font-mono text-xs text-stone-400">{a.entityId.slice(0, 8)}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-stone-700">{a.actorUserId ? (names.get(a.actorUserId) ?? (a.actorUserId === 'ornek-veri' ? 'Örnek veri' : a.actorUserId.slice(0, 8))) : 'Sistem'}</td>
              </tr>
            ))}
            {!r.data.rows.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-500">Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-stone-600">
        <span>{page + 1} / {pages} sayfa · {r.data.total} kayıt</span>
        <span className="flex gap-2">
          {page > 0 && <Link className={pager} href={`?${qs(page - 1)}`}>Önceki</Link>}
          {page < pages - 1 && <Link className={pager} href={`?${qs(page + 1)}`}>Sonraki</Link>}
        </span>
      </div>
    </div>
  );
}
