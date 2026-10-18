export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Sayfa bulunamadı</h1>
      <p className="mt-2 text-stone-600">Aradığınız sayfa yok ya da erişiminiz kapalı.</p>
      <a href="/" className="mt-4 inline-block underline">Ana sayfaya dön</a>
    </main>
  );
}
