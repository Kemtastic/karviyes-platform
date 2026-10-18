import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export default async function globalTeardown() {
  const pid = readFileSync('.data/e2e/server.pid', 'utf8').trim();
  try {
    execSync(process.platform === 'win32' ? `taskkill /pid ${pid} /T /F` : `kill -TERM -${pid}`, { stdio: 'ignore' });
  } catch {
    // süreç zaten kapanmış
  }
}
