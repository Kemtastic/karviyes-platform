import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoFileId: uuid('logo_file_id'),
  brandColor: text('brand_color'),
  /** Firmanın adresi (ör. plastik.kemalayan.com); istek bu adresten gelirse bu firma seçilir. Boşsa kurulumun firması. */
  host: text('host').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
