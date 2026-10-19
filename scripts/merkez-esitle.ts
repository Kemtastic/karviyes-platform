// Müşteri sunucusunda merkezden firma ayarını çeker (cron ya da systemd zamanlayıcısıyla saatte bir çalıştırın).
// Kullanım: npx tsx --env-file=.env scripts/merkez-esitle.ts
import { closeDb } from '@/core/db/client';
import { syncInstallFromCentral } from '@/core/platform/central-sync';

const r = await syncInstallFromCentral();
console.log(r.applied ? '[merkez] Ayar uygulandı.' : `[merkez] Uygulanmadı: ${r.reason}`);
await closeDb(process.env.DATABASE_URL ?? '').catch(() => {});
process.exit(r.applied ? 0 : 1);
