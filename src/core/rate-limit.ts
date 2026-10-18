import { sql } from 'drizzle-orm';
import { getDb, rowsOf, type Db } from '@/core/db/client';

// Oturumsuz uçlar için sabit pencereli sayaç (60 sn). Sınır aşılınca true döner.
export async function publicRateLimited(key: string, limit = 30, db?: Db): Promise<boolean> {
  const database = db ?? (await getDb());
  const result = await database.execute(sql`
    insert into rate_limits (key, window_start, count) values (${'pub:' + key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - interval '60 seconds' then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - interval '60 seconds' then now() else rate_limits.window_start end
    returning count`);
  const [row] = rowsOf<{ count: number }>(result);
  return Boolean(row && row.count > limit);
}
