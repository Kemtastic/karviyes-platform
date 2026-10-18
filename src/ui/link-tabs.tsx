import Link from 'next/link';

export type LinkTab = { href: string; label: string; active: boolean; count?: number };

// Adres temelli sekmeler (durum, görünüm, kırılım): seçili olan aria-current ile işaretlenir.
export function LinkTabs({ label, items }: { label: string; items: LinkTab[] }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:border-stone-300 hover:text-stone-900 aria-[current=page]:border-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white"
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-black/10 px-1.5 text-xs tabular-nums">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
