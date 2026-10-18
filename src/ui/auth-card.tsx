import { Factory } from 'lucide-react';

// Giriş, 2FA, davet ve parola sıfırlama ekranlarının ortak çerçevesi: geniş ekranda solda tanıtım paneli.
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-[var(--color-canvas)] lg:grid-cols-[1fr_minmax(420px,520px)]">
      <aside className="relative hidden overflow-hidden bg-stone-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[var(--brand)] opacity-25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-amber-500 opacity-10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Factory aria-hidden className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Üretim Platformu</span>
        </div>
        <div className="relative max-w-md space-y-4">
          <p className="text-3xl font-semibold leading-tight tracking-tight">Siparişten sevke, bütün üretim tek ekranda.</p>
          <p className="text-stone-300">Sipariş, kumaş ve sap stoğu, bölüm tabletleri, kontrol ve sevk; satış takibi ve raporlar. Her firma için ayrı, güvenli kurulum.</p>
        </div>
        <p className="relative text-sm text-stone-400">İki adımlı doğrulama · firma verisi yalnızca firmanın kendisine görünür</p>
      </aside>
      <div className="flex items-center justify-center px-4 py-10">
        <section className="w-full max-w-sm rounded-2xl border border-stone-200/80 bg-white p-7 shadow-[var(--shadow-card)]">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900 text-white">
              <Factory aria-hidden className="h-4 w-4" />
            </span>
            <span className="font-semibold">Üretim Platformu</span>
          </div>
          <h1 className="mb-5 text-xl font-semibold tracking-tight">{title}</h1>
          {children}
        </section>
      </div>
    </main>
  );
}

export const inputClass =
  'mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base shadow-sm transition-colors hover:border-stone-400 focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[var(--brand-soft)]';
export const buttonClass = 'w-full rounded-xl bg-stone-900 px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-stone-800 disabled:opacity-60';
