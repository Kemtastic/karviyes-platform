import { notFound } from 'next/navigation';
import { formatDateTime } from '@/core/dates';
import { platformAuditList } from '@/core/platform/companies';
import { PageHeader } from '@/ui/page-header';

export default async function PlatformAuditPage() {
  const r = await platformAuditList({ limit: 300 });
  if (!r.ok) notFound();
  return (
    <div className="space-y-5">
      <PageHeader title="Panel kaydı" description="Merkez panelde yapılan her işlem: kim, ne zaman, hangi firmada, önce ve sonra." />
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-3 text-left font-semibold">Zaman</th><th className="px-4 py-3 text-left font-semibold">Firma</th><th className="px-4 py-3 text-left font-semibold">İşlem</th><th className="px-4 py-3 text-left font-semibold">Ayrıntı</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.data.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-stone-600">{formatDateTime(new Date(a.at))}</td>
                <td className="px-4 py-2.5">{a.companyName ?? '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.action}</td>
                <td className="max-w-xl px-4 py-2.5 font-mono text-xs text-stone-500"><span className="line-clamp-3 break-all">{JSON.stringify(a.detail)}</span></td>
              </tr>
            ))}
            {!r.data.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-stone-500">Henüz kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
