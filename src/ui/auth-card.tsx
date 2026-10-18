export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-stone-100 px-4">
      <section className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export const inputClass = 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-base focus:outline-2 focus:outline-orange-600';
export const buttonClass = 'w-full rounded-lg bg-stone-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60';
