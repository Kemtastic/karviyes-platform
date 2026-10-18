import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // VPS/Docker için kendi kendine yeten derleme çıktısı.
  output: 'standalone',
  // Uçtan uca testler ayrı derleme klasörü kullanır; açık geliştirme sunucusuyla çakışmaz.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // Veritabanı sürücüleri paketlenmez; Node çalışma zamanında doğrudan yüklenir.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // PDF uçları gömülü Türkçe yazı tipini okur; derlemeye dahil edilir.
  outputFileTracingIncludes: { '/api/pdf/**': ['./src/core/pdf/fonts/**'] },
  // Cari içe aktarma CSV'yi sunucu eylemiyle gönderir (servis 3 MB'ı reddeder).
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

export default nextConfig;
