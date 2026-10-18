import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
          <Compass aria-hidden className="h-7 w-7" />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-stone-500">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">Sayfa bulunamadı</h1>
        <p className="mt-2 text-stone-600">Aradığınız sayfa yok ya da erişiminiz kapalı.</p>
        <a href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-800">Ana sayfaya dön</a>
      </div>
    </main>
  );
}
