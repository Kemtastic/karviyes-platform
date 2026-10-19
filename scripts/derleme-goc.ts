// Vercel derlemesinden önce veritabanı göçlerini uygular. Göç başarısız olursa derleme durur ve
// önceki sürüm yayında kalır (yeni kod eski şemayla açılmaz). Vercel dışında hiçbir şey yapmaz.
import { isNotNull } from 'drizzle-orm';
import { closeDb, connectDb, migrateDb } from '@/core/db/client';
import { decryptUrl } from '@/core/db/router';
import { companies } from '@/core/db/schema';

const url = process.env.DATABASE_URL ?? '';
if (!process.env.VERCEL) {
  console.log('[göç] Vercel dışında derleme; göç atlandı.');
} else if (process.env.VERCEL_ENV !== 'production') {
  // Önizleme dalları gözden geçirilmemiş göçü canlı veritabanına uygulamasın.
  console.log(`[göç] ${process.env.VERCEL_ENV ?? 'bilinmeyen'} ortamı; göç yalnızca canlı (production) derlemede çalışır.`);
} else if (!url || url.startsWith('pglite://')) {
  console.log('[göç] DATABASE_URL Postgres değil; göç atlandı.');
} else {
  const started = Date.now();
  const db = await connectDb(url);
  await migrateDb(db, url);
  // Kendi veritabanı olan firmalar da aynı sürüme taşınır; biri başarısız olursa derleme durur.
  const own = await db.select({ slug: companies.slug, enc: companies.dataUrlEnc }).from(companies).where(isNotNull(companies.dataUrlEnc));
  for (const c of own) {
    const target = decryptUrl(c.enc!);
    await migrateDb(await connectDb(target), target);
    await closeDb(target);
    console.log(`[göç] ${c.slug}: firma veritabanı güncel.`);
  }
  await closeDb(url);
  console.log(`[göç] Göçler uygulandı: ana + ${own.length} firma veritabanı (${Date.now() - started} ms).`);
}
process.exit(0);
