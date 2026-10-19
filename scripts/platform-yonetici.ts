// Mevcut bir kullanıcıyı merkez panel yöneticisi yapar (ya da yetkisini kaldırır). Kullanım:
//   npx tsx --env-file=.env.kurulum scripts/platform-yonetici.ts <e-posta> [--kaldir]
// Kullanıcı önce normal yoldan (kurulum ya da davet) hesap açmış olmalı; panele girmek için iki adımlı doğrulama zorunludur.
import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { platformAdmins, platformAudit, user } from '@/core/db/schema';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const remove = process.argv.includes('--kaldir');
if (!email) throw new Error('E-posta verin: scripts/platform-yonetici.ts <e-posta> [--kaldir]');
const db = await getDb();
const [u] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.email, email));
if (!u) throw new Error('Bu e-postayla kullanıcı yok; önce hesap açın.');
if (remove) {
  await db.delete(platformAdmins).where(eq(platformAdmins.userId, u.id));
  await db.insert(platformAudit).values({ actorUserId: 'komut-satiri', action: 'platform.adminRemoved', detail: { email } });
  console.log(`${u.name} artık merkez panel yöneticisi değil.`);
} else {
  await db.insert(platformAdmins).values({ userId: u.id, createdBy: 'komut-satiri' }).onConflictDoNothing();
  await db.insert(platformAudit).values({ actorUserId: 'komut-satiri', action: 'platform.adminAdded', detail: { email } });
  console.log(`${u.name} merkez panel yöneticisi. Panel: /platform (iki adımlı doğrulama zorunlu).`);
}
process.exit(0);
