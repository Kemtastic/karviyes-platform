import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { NavIcon } from './icon';

// Ana sayfadaki özet kartı: simge, değer, etiket; dikkat gerektirenler amber.
export function StatCard({ label, value, href, icon, tone }: { label: string; value: string; href: string; icon: string; tone?: 'warn' }) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-card)] transition sm:gap-3 sm:p-4 hover:-translate-y-0.5 hover:shadow-md ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-stone-200/80 bg-white'}`}
    >
      <span className="flex items-center justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'}`}>
          <NavIcon name={icon} />
        </span>
        <ArrowUpRight aria-hidden className="h-4 w-4 text-stone-400 transition group-hover:text-stone-700" />
      </span>
      <span>
        <span className="block break-words text-xl font-semibold tabular-nums tracking-tight text-stone-900 sm:text-2xl">{value}</span>
        <span className="block text-xs text-stone-600 sm:text-sm">{label}</span>
      </span>
    </Link>
  );
}
