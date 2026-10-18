'use client';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/core/action';

// Sunucu eylemini çağırır; bekleme, hata ve alan hatalarını tutar.
export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function run(input: I, onSuccess?: (data: O) => void) {
    setError('');
    setFieldErrors({});
    start(async () => {
      const r = await action(input);
      if (r.ok) onSuccess?.(r.data);
      else {
        setError(r.errorId ? `${r.message} (Kod: ${r.errorId})` : r.message);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });
  }

  // Form yapısı değişince (ör. satır silinince) eski alan hataları yanlış yerde kalmasın.
  function clearErrors() {
    setError('');
    setFieldErrors({});
  }

  return { run, pending, error, fieldErrors, clearErrors };
}
