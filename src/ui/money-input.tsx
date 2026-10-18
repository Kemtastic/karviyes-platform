'use client';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { formatMoney, parseMoney, type Currency } from '@/core/money';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'defaultValue'> & {
  currency: Currency;
  allowNegative?: boolean;
  defaultValue?: string;
  onValueChange?: (text: string) => void;
};

// Tutarı Türkçe biçimde alır ("1.234,56"); odaktan çıkınca iki haneye tamamlar.
export function MoneyInput({ currency, allowNegative = false, defaultValue = '', onValueChange, className = '', ...props }: Props) {
  const [text, setText] = useState(defaultValue);
  const [error, setError] = useState('');
  const errorId = useId();
  const symbolId = useId();

  function normalize() {
    if (!text.trim()) return setError('');
    try {
      const m = parseMoney(text, currency);
      if (m.minor < 0n && !allowNegative) return setError('Negatif tutar girilemez.');
      const formatted = formatMoney(m).replace(/\s\S+$/, '');
      setText(formatted);
      setError('');
      onValueChange?.(formatted);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tutar anlaşılamadı.');
    }
  }

  return (
    <span className="block">
      <span className="relative block">
        <input
          {...props}
          type="text"
          inputMode="decimal"
          value={text}
          aria-invalid={Boolean(error)}
          aria-describedby={`${symbolId}${error ? ' ' + errorId : ''}`}
          onChange={(e) => {
            setText(e.target.value);
            onValueChange?.(e.target.value);
          }}
          onBlur={normalize}
          className={`w-full rounded-lg border border-stone-300 px-3 py-2.5 pr-10 text-right tabular-nums ${className}`}
        />
        <span id={symbolId} className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-500">
          {currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : '€'}
        </span>
      </span>
      {error && (
        <span id={errorId} role="alert" className="mt-1 block text-sm text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
