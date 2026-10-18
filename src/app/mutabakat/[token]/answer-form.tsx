'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, fieldClass } from '@/ui/form-field';
import { answerReconciliationAction } from '../actions';

export function AnswerForm({ token, currency }: { token: string; currency: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'agreed' | 'disputed' | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="text-[15px] font-semibold">Cevabınız</h2>
      <p className="mt-1 text-sm text-stone-600">Cevabınız bir kez kaydedilir ve gönderen firmaya iletilir.</p>
      <div role="radiogroup" aria-label="Mutabakat cevabı" className="mt-4 grid gap-2 sm:grid-cols-2">
        {(['agreed', 'disputed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className={`min-h-14 rounded-xl border px-4 text-left font-semibold transition-colors ${status === s ? (s === 'agreed' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-amber-500 bg-amber-50 text-amber-900') : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'}`}
          >
            {s === 'agreed' ? 'Mutabıkız' : 'Mutabık değiliz'}
          </button>
        ))}
      </div>
      {status && (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = { ...Object.fromEntries(new FormData(e.currentTarget)), status };
            setError('');
            setFieldErrors({});
            start(async () => {
              const r = await answerReconciliationAction(token, data);
              if (r.ok) router.refresh();
              else {
                setError(r.message);
                setFieldErrors(('fieldErrors' in r && r.fieldErrors) || {});
              }
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Adınız soyadınız" required error={fieldErrors.name}><input name="name" autoComplete="name" className={fieldClass} /></FormField>
            <FormField label="Unvanınız" error={fieldErrors.title}><input name="title" autoComplete="organization-title" className={fieldClass} placeholder="örn. Muhasebe müdürü" /></FormField>
          </div>
          {status === 'disputed' && (
            <>
              <FormField label={`Sizin kayıtlarınızdaki bakiye (${currency})`} error={fieldErrors.counterBalance} hint="Bizim açımızdan: size göre ne kadar borçlu/alacaklısınız"><input name="counterBalance" inputMode="decimal" className={fieldClass} placeholder="0,00" /></FormField>
              <FormField label="Farkın nedeni" required error={fieldErrors.note}><textarea name="note" rows={4} className={fieldClass} placeholder="Hangi fatura ya da ödeme farklı görünüyor?" /></FormField>
            </>
          )}
          {status === 'agreed' && <FormField label="Not" error={fieldErrors.note}><textarea name="note" rows={2} className={fieldClass} /></FormField>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <button disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-stone-900 px-5 font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-60 sm:w-auto">
            {pending ? 'Gönderiliyor…' : 'Cevabı gönder'}
          </button>
        </form>
      )}
    </section>
  );
}
