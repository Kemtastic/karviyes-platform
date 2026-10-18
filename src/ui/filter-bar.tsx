// Liste ekranlarındaki arama / tarih süzgeci (GET formu: adres paylaşılabilir kalır).
export const filterInputClass =
  'mt-1 min-h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm shadow-sm transition-colors hover:border-stone-400 focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[var(--brand-soft)]';

export function FilterBar({ children, search = false }: { children: React.ReactNode; search?: boolean }) {
  return (
    <form role={search ? 'search' : undefined} className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[var(--shadow-card)]">
      {children}
    </form>
  );
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col text-xs font-medium text-stone-600">{label}{children}</label>;
}

export const filterButtonClass = 'min-h-10 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-800';
