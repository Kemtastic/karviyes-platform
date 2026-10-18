import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Veritabanı sürücüleri paketlenmez; Node çalışma zamanında doğrudan yüklenir.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};

export default nextConfig;
