import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { istanbulToday } from '@/core/dates';
import { formatMoney, money } from '@/core/money';
import { babsReport, BABS_DEFAULT_THRESHOLD_TL } from '@/modules/finance/server/reports';
import { requireFinancePage } from '@/modules/finance/ui/guard';
import { Badge } from '@/ui/badge';
import { buttonClasses } from '@/ui/button';
import { FilterBar, FilterField, filterButtonClass, filterInputClass } from '@/ui/filter-bar';
import { PageHeader } from '@/ui/page-header';

function previousMonth(): string {
  const d = new Date(`${istanbulToday().slice(0, 7)}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default async function BabsPage({ searchParams }: { searchParams: Promise<{ ay?: string; esik?: string }> }) {
  await requireFinancePage();
  const sp = await searchParams;
  const month = sp.ay && /^\d{4}-\d{2}$/.test(sp.ay) ? sp.ay : previousMonth();
  const threshold = Number(sp.esik) >= 0 && sp.esik ? Number(sp.esik) : BABS_DEFAULT_THRESHOLD_TL;
  const r = await babsReport({ month, thresholdTl: threshold });
  if (!r.ok) notFound();
  const { rows, foreign } = r.data;
  const missing = rows.filter((x) => x.missingTaxId).length;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Ba-Bs hazırlık listesi"
        description="Ay içinde aynı kişi ya da kurumla KDV hariç toplamı eşiği aşan alışlar (Form Ba) ve satışlar (Form Bs). Fatura kayıtlarından hazırlanır; bildirim mali müşavirce yapılır."
        actions={<a href={`/api/disa-aktar/muhasebe?tur=ba-bs&ay=${month}&esik=${threshold}`} className={buttonClasses('secondary')}><FileSpreadsheet aria-hidden className="h-4 w-4" /> Excel&apos;e aktar</a>}
      />
      <FilterBar>
        <FilterField label="Ay"><input type="month" name="ay" defaultValue={month} className={filterInputClass} /></FilterField>
        <FilterField label="Eşik (TL, KDV hariç)"><input type="number" name="esik" min={0} step={1} defaultValue={threshold} className={`${filterInputClass} w-36`} /></FilterField>
        <button className={filterButtonClass}>Göster</button>
      </FilterBar>
      <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        Eşik ve bildirim kuralları değişebilir; güncel tutarı GİB&apos;den doğrulayın. İade faturaları ve dövizli faturalar listeye otomatik girmez (dövizliler aşağıda ayrıca gösterilir).
      </p>
      {missing > 0 && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{missing} carinin VKN/TCKN bilgisi eksik; bildirimden önce cari kartından tamamlayın.</p>}
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-3 text-left font-semibold">Form</th><th className="px-4 py-3 text-left font-semibold">Unvan</th><th className="px-4 py-3 text-left font-semibold">VKN/TCKN</th><th className="px-4 py-3 text-left font-semibold">Vergi dairesi</th><th className="px-4 py-3 text-right font-semibold">Belge</th><th className="px-4 py-3 text-right font-semibold">KDV hariç tutar</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((g) => (
              <tr key={`${g.form}-${g.partyId}`} className="hover:bg-stone-50/70">
                <td className="px-4 py-3"><Badge tone={g.form === 'Bs' ? 'brand' : 'neutral'} dot={false}>{g.form}</Badge></td>
                <td className="px-4 py-3"><Link href={`/cariler/${g.partyId}`} className="font-medium text-stone-900 hover:underline">{g.name}</Link></td>
                <td className="px-4 py-3 font-mono text-xs">{g.taxId || <span className="font-sans font-medium text-red-700">eksik</span>}</td>
                <td className="px-4 py-3 text-stone-600">{g.taxOffice || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{g.count}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoney(money(g.base, 'TRY'))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-500">Bu ay eşiği aşan alış ya da satış yok.</td></tr>}
          </tbody>
        </table>
      </div>
      {foreign.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold text-stone-900">Dövizli faturalar (TL karşılığı mali müşavirce eklenecek)</h2>
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white text-sm shadow-[var(--shadow-card)]">
            {foreign.map((f, i) => <li key={i} className="flex justify-between px-4 py-2.5"><span>{f.form} · {f.name} {f.taxId && <span className="font-mono text-xs text-stone-500">{f.taxId}</span>}</span><span className="text-stone-600">{f.count} belge · {f.currency}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
