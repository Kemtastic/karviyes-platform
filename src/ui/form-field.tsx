import { cloneElement, isValidElement, useId, type ReactElement } from 'react';

type Props = { label: string; hint?: string; error?: string; required?: boolean; children: ReactElement<Record<string, unknown>> };

export const fieldClass = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base aria-[invalid=true]:border-red-700';

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
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="text-xs text-stone-500">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
