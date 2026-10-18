import { getDb, migrateDb } from '@/core/db/client';
import { getEnv } from '@/core/env';

await migrateDb(await getDb(), getEnv().DATABASE_URL);
console.log('Göçler uygulandı.');
process.exit(0);
