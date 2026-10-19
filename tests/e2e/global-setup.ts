import { execSync, spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { E2E_PORT, e2eEnv } from './env';

// Temiz bir veritabanı kurar, ardından uygulamayı ayrı portta başlatır (kurulum ve sunucu aynı anda açmaz).
export default async function globalSetup() {
  rmSync('.data/e2e', { recursive: true, force: true });
  execSync('npx tsx scripts/kurulum.ts', { env: e2eEnv(), stdio: 'inherit' });
  // E2E yöneticisi aynı zamanda merkez panel yöneticisi (panel testleri için).
  execSync(`npx tsx scripts/platform-yonetici.ts ${e2eEnv().KURULUM_ADMIN_EMAIL}`, { env: e2eEnv(), stdio: 'inherit' });
  const server = spawn('npx', ['next', 'dev', '--port', String(E2E_PORT)], { env: e2eEnv(), shell: true, stdio: 'ignore', detached: false });
  writeFileSync('.data/e2e/server.pid', String(server.pid));
  for (let i = 0; i < 180; i++) {
    try {
      const res = await fetch(`http://localhost:${E2E_PORT}/giris`);
      if (res.ok) return;
    } catch {
      // sunucu henüz hazır değil
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('E2E sunucusu başlamadı');
}
