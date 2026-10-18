'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Bir şeyler ters gitti</h1>
      <p className="mt-2 text-stone-600">İşlem tamamlanamadı. Sorun sürerse yöneticinize şu kodu iletin:</p>
      <code className="mt-2 block text-sm">{error.digest ?? 'kod yok'}</code>
      <button onClick={reset} className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-white">Tekrar dene</button>
    </main>
  );
}
