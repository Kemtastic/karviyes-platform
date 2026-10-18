import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand)] text-white hover:brightness-95',
  secondary: 'border border-stone-300 bg-white text-stone-900 hover:bg-stone-50',
  // Tehlikeli işlemler marka renginden ayrıdır: çerçeveli kırmızı.
  danger: 'border-2 border-red-700 bg-white text-red-700 hover:bg-red-50',
  ghost: 'text-stone-700 hover:bg-stone-100',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      data-variant={variant}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
