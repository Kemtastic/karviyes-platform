import { formatDate } from '@/core/dates';

export function DateText({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-stone-400">—</span>;
  return <time dateTime={value}>{formatDate(value)}</time>;
}
