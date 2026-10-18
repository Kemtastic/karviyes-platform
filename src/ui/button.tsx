import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand)] text-white shadow-sm hover:bg-[var(--brand-strong)]',
  secondary: 'border border-stone-300 bg-white text-stone-800 shadow-sm hover:border-stone-400 hover:bg-stone-50',
  // Tehlikeli işlemler marka renginden ayrıdır: çerçeveli kırmızı.
  danger: 'border border-red-300 bg-white text-red-700 shadow-sm hover:border-red-400 hover:bg-red-50',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
};

// Bağlantı olarak görünmesi gereken düğmeler (ör. "Excel'e aktar") aynı görünüm sınıflarını kullanır.
export const buttonClasses = (variant: ButtonVariant = 'secondary', extra = '') =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${extra}`;

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button data-variant={variant} className={buttonClasses(variant, className)} {...props} />;
}
