import { formatMoney, type Money as MoneyValue } from '@/core/money';

export function Money({ value, className = '' }: { value: MoneyValue; className?: string }) {
  const negative = value.minor < 0n;
  return (
    // Hizalama varsayılan sağdır (tablo); sınıfta text-left verilirse sola yaslanır.
    <span data-negative={negative} className={`block tabular-nums whitespace-nowrap ${className.includes('text-left') ? '' : 'text-right'} ${negative ? 'text-red-700' : ''} ${className}`}>
      {formatMoney(value)}
    </span>
  );
}
