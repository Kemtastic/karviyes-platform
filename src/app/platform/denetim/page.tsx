import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/core/dates';
import { platformCompanyAudit } from '@/core/platform/insight';
import { PageHeader } from '@/ui/page-header';

export default async function PlatformCompanyAuditPage() {
  const r = await platformCompanyAudit({ limit: 300 });
  if (!r.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader title="Firma kayıtları" description="Bütün firmaların denetim kaydı, yeniden eskiye: kim, hangi firmada, ne yaptı. Kayıt firmanın kendi verisinde durur; burada yalnız okunur." />
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-3 text-left font-semibold">Zaman</th><th className="px-4 py-3 text-left font-semibold">Firma</th><th className="px-4 py-3 text-left font-semibold">Kim</th><th className="px-4 py-3 text-left font-semibold">İşlem</th><th className="px-4 py-3 text-left font-semibold">Kayıt</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.map((a) => (
              <tr key={`${a.companyId}-${a.id}`}>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-stone-600">{formatDateTime(new Date(a.at))}</td>
                <td className="px-4 py-2.5"><Link href={`/platform/firmalar/${a.companyId}`} className="hover:underline">{a.companyName}</Link></td>
                <td className="px-4 py-2.5">{a.actorName ?? 'Sistem'}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.action}</td>
                <td className="px-4 py-2.5 text-stone-500">{a.entity} <span className="font-mono text-xs">{a.entityId}</span></td>
              </tr>
            ))}
            {!r.data.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">Henüz kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
