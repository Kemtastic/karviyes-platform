// Ekranlardaki bölüm kutusu: isteğe bağlı başlık, açıklama ve sağda eylemler.
type Props = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** İçerik kenara dayalı (tablo gibi) ise false. */
  padded?: boolean;
  /** Erişilebilir bölge adı (ekran okuyucu ve testler için). */
  label?: string;
  tone?: 'default' | 'warn' | 'danger' | 'success';
};

const TONES = {
  default: 'border-stone-200/80 bg-white',
  warn: 'border-amber-200 bg-amber-50/70',
  danger: 'border-red-200 bg-red-50/70',
  success: 'border-emerald-200 bg-emerald-50/70',
};

export function Card({ title, description, actions, children, className = '', padded = true, label, tone = 'default' }: Props) {
  return (
    <section aria-label={label} className={`rounded-2xl border shadow-[var(--shadow-card)] ${TONES[tone]} ${className}`}>
      {(title || actions) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${padded ? 'px-5 pt-5' : 'border-b border-stone-100 px-5 py-4'}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className={padded ? 'p-5' : ''}>{children}</div>}
    </section>
  );
}
