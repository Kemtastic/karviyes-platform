import type { Metadata } from 'next';
import { CircleCheck, FileDown, ShieldCheck, TriangleAlert } from 'lucide-react';
import { formatDate, formatDateTime } from '@/core/dates';
import { formatMoney, money } from '@/core/money';
import { publicReconciliation } from '@/modules/finance/server/reconciliation';
import { AnswerForm } from './answer-form';

export const metadata: Metadata = { title: 'Cari hesap mutabakatı', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function PublicReconciliationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await publicReconciliation(token);
  if (!r) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--color-canvas)] px-4">
        <div className="max-w-md text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-700"><TriangleAlert aria-hidden className="h-7 w-7" /></span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Bağlantı geçersiz</h1>
          <p className="mt-2 text-stone-600">Bağlantının süresi dolmuş ya da yerine yenisi gönderilmiş olabilir. Lütfen gönderen firmadan yeni bağlantı isteyin.</p>
        </div>
      </main>
    );
  }
  const fm = (v: string) => formatMoney(money(v, r.currency));
  const b = BigInt(r.balance);
  const abs = (b < 0n ? -b : b).toString();
  const answered = r.status === 'agreed' || r.status === 'disputed';
  return (
    <main className="min-h-dvh bg-[var(--color-canvas)] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{r.company} · {r.no}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cari hesap mutabakatı</h1>
          <p className="text-stone-600">Sayın {r.contactName || r.partyName}, {r.company} kayıtlarına göre {formatDate(r.asOf)} tarihi itibarıyla hesabınız aşağıdaki gibidir.</p>
        </header>
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{formatDate(r.asOf)} itibarıyla bakiye</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{fm(abs)}</p>
          <p className="mt-1 font-medium text-stone-700">{b > 0n ? `${r.company} firmasına borçlusunuz.` : b < 0n ? `${r.company} firmasından alacaklısınız.` : 'Hesap kapalıdır.'}</p>
          {r.message && <p className="mt-4 whitespace-pre-line rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700">{r.message}</p>}
          <a href={`/api/mutabakat/${token}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"><FileDown aria-hidden className="h-4 w-4" /> Mektubu ve ekstreyi indir (PDF)</a>
        </section>
        {answered ? (
          <section className={`flex items-start gap-3 rounded-2xl border p-5 ${r.status === 'agreed' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <CircleCheck aria-hidden className={`mt-0.5 h-5 w-5 ${r.status === 'agreed' ? 'text-emerald-700' : 'text-amber-700'}`} />
            <div>
              <p className="font-semibold">{r.status === 'agreed' ? 'Mutabık olduğunuzu bildirdiniz.' : 'Mutabık olmadığınızı bildirdiniz.'}</p>
              <p className="text-sm text-stone-600">{r.response?.name}{r.response?.title ? ` · ${r.response.title}` : ''} · {r.response ? formatDateTime(new Date(r.response.at)) : ''}</p>
              {r.response?.counterBalance && <p className="mt-1 text-sm">Sizin kayıtlarınızdaki bakiye: <strong>{fm(r.response.counterBalance)}</strong></p>}
              {r.response?.note && <p className="mt-1 whitespace-pre-line text-sm">{r.response.note}</p>}
              <p className="mt-2 text-xs text-stone-500">Cevap kesinleşmiştir; değişiklik için {r.company} ile iletişime geçin.</p>
            </div>
          </section>
        ) : r.status === 'pending' ? (
          <AnswerForm token={token} currency={r.currency} />
        ) : null}
        <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
          <h2 className="border-b border-stone-100 px-5 py-4 text-[15px] font-semibold">Ekstre</h2>
          {r.truncated && <p className="px-5 pt-3 text-xs text-stone-500">Yalnızca son 500 hareket gösterilmektedir.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-4 py-3 text-left font-semibold">Tarih</th><th className="px-4 py-3 text-left font-semibold">Açıklama</th><th className="px-4 py-3 text-right font-semibold">Borç</th><th className="px-4 py-3 text-right font-semibold">Alacak</th><th className="px-4 py-3 text-right font-semibold">Bakiye</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {r.rows.map((x, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-stone-600">{formatDate(x.date)}</td>
                    <td className="px-4 py-2.5">{x.text}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{x.debit !== '0' ? fm(x.debit) : ''}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{x.credit !== '0' ? fm(x.credit) : ''}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{fm(x.balance)}</td>
                  </tr>
                ))}
                {!r.rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-500">Bu tarihe kadar hareket yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <p className="flex items-center gap-2 text-xs text-stone-500"><ShieldCheck aria-hidden className="h-4 w-4" /> Bu bağlantı size özeldir; başkalarıyla paylaşmayın. Cevap verilmemesi mutabakat sayılmaz.</p>
      </div>
    </main>
  );
}
