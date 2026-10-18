import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoFileId: uuid('logo_file_id'),
  brandColor: text('brand_color'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
