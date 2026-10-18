export const E2E_PORT = 3100;
export const E2E_ADMIN = { email: 'e2e-yonetici@example.com', name: 'E2E Yönetici', password: 'E2e-Deneme-Parola-2026' };

export function e2eEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_DIST_DIR: '.next-e2e',
    DATABASE_URL: 'pglite://.data/e2e/db',
    BETTER_AUTH_SECRET: 'e2e-gizli-anahtar-en-az-otuz-iki-karakter-uzun',
    BETTER_AUTH_URL: `http://localhost:${E2E_PORT}`,
    STORAGE_DRIVER: 'fs',
    STORAGE_FS_DIR: '.data/e2e/files',
    INSTALL_CONFIG_PATH: 'kurulum.config.example.json',
    KURULUM_ADMIN_EMAIL: E2E_ADMIN.email,
    KURULUM_ADMIN_NAME: E2E_ADMIN.name,
    KURULUM_ADMIN_PASSWORD: E2E_ADMIN.password,
  };
}
