import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Yazma işlemleri için kullanıcı başına hız sınırı sayacı (birden çok sunucu örneğinde ortak).
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
});
