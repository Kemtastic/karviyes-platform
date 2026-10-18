export type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

const TONES: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
  brand: 'bg-[var(--brand-soft)] text-[var(--brand-strong)] ring-[color-mix(in_srgb,var(--brand)_25%,white)]',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  muted: 'bg-stone-50 text-stone-500 ring-stone-200',
};

// Durum rozeti: renk yalnız ipucudur, metin her zaman yazılır.
export function Badge({ tone = 'neutral', children, dot = true }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
