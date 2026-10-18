import { cloneElement, isValidElement, useId, type ReactElement } from 'react';

type Props = { label: string; hint?: string; error?: string; required?: boolean; children: ReactElement<Record<string, unknown>> };

export const fieldClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 shadow-sm placeholder:text-stone-400 transition-colors hover:border-stone-400 focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[var(--brand-soft)] aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-red-100 disabled:bg-stone-50 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200';

// Etiket, ipucu ve hata metnini alana erişilebilir biçimde bağlar.
export function FormField({ label, hint, error, required, children }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })
    : children;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="text-xs text-stone-500">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
