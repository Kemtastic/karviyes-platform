import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AUDIT_PAGE_SIZE, listAudit } from '@/core/company/service';
import { formatDateTime } from '@/core/dates';
import { fieldClass } from '@/ui/form-field';

type Search = { from?: string; to?: string; entity?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const r = await listAudit({ from: sp.from || undefined, to: sp.to || undefined, entity: sp.entity || undefined, page });
  if (!r.ok) notFound();
  const pages = Math.max(1, Math.ceil(r.data.total / AUDIT_PAGE_SIZE));
  const qs = (p: number) => new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(sp.entity ? { entity: sp.entity } : {}), page: String(p) }).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Denetim kaydı</h1>
      <p className="text-sm text-stone-600">Sistemde yapılan her değişiklik burada değiştirilemez biçimde tutulur.</p>
      <form className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-4">
        <label className="text-sm font-medium">Başlangıç<input type="date" name="from" defaultValue={sp.from} className={fieldClass} /></label>
        <label className="text-sm font-medium">Bitiş<input type="date" name="to" defaultValue={sp.to} className={fieldClass} /></label>
        <label className="text-sm font-medium">Kayıt türü<input name="entity" defaultValue={sp.entity} placeholder="örn. order" className={fieldClass} /></label>
        <button className="self-end rounded-lg bg-stone-900 px-4 py-2.5 font-semibold text-white">Filtrele</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-stone-600">
            <tr><th className="px-3 py-2">Zaman</th><th className="px-3 py-2">İşlem</th><th className="px-3 py-2">Kayıt</th><th className="px-3 py-2">Kullanıcı</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(new Date(a.at))}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.action}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.entity} · {a.entityId.slice(0, 8)}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.actorUserId?.slice(0, 8) ?? 'sistem'}</td>
              </tr>
            ))}
            {!r.data.rows.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-stone-500">Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>{page + 1} / {pages} sayfa · {r.data.total} kayıt</span>
        <span className="flex gap-2">
          {page > 0 && <Link className="rounded border px-3 py-1" href={`?${qs(page - 1)}`}>Önceki</Link>}
          {page < pages - 1 && <Link className="rounded border px-3 py-1" href={`?${qs(page + 1)}`}>Sonraki</Link>}
        </span>
      </div>
    </div>
  );
}
