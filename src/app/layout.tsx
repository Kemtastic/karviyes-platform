import type { Metadata } from 'next';
import './globals.css';

// CSP nonce'u her istekte üretildiği için tüm sayfalar dinamik oluşturulur.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Üretim Platformu' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
