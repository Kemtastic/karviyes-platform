import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Yazı tipi derlemede indirilir ve kendi sunucumuzdan verilir (dış istek ve CSP istisnası yok); Türkçe harfler için latin-ext.
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap' });

// CSP nonce'u her istekte üretildiği için tüm sayfalar dinamik oluşturulur.
export const dynamic = 'force-dynamic';
// Sunucu fonksiyonu veritabanıyla aynı bölgede (Supabase Frankfurt) çalışır; bkz. docs/demo-yayini.md.
export const preferredRegion = 'fra1';

export const metadata: Metadata = { title: 'Üretim Platformu' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="font-sans text-stone-900 antialiased">{children}</body>
    </html>
  );
}
