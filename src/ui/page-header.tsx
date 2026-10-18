// Sayfa başlığı: üstte küçük bağlam satırı, başlık (h1), açıklama ve sağda eylemler.
export function PageHeader({ title, eyebrow, description, actions }: { title: React.ReactNode; eyebrow?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
