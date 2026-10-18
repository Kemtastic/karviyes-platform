import { formatMoney, type Money as MoneyValue } from '@/core/money';

export function Money({ value, className = '' }: { value: MoneyValue; className?: string }) {
  const negative = value.minor < 0n;
  return (
    <span data-negative={negative} className={`block text-right tabular-nums whitespace-nowrap ${negative ? 'text-red-700' : ''} ${className}`}>
      {formatMoney(value)}
    </span>
  );
}
