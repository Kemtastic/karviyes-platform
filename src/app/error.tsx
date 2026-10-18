'use client';
import { TriangleAlert } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700">
          <TriangleAlert aria-hidden className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-stone-900">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-stone-600">İşlem tamamlanamadı. Sorun sürerse yöneticinize şu kodu iletin:</p>
        <code className="mt-3 inline-block rounded-lg bg-stone-100 px-3 py-1.5 font-mono text-sm text-stone-700">{error.digest ?? 'kod yok'}</code>
        <div>
          <button onClick={reset} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-800">Tekrar dene</button>
        </div>
      </div>
    </main>
  );
}
