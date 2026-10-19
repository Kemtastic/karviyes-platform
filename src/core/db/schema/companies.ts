import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoFileId: uuid('logo_file_id'),
  brandColor: text('brand_color'),
  /** Firmanın adresi (ör. plastik.kemalayan.com); istek bu adresten gelirse bu firma seçilir. Boşsa kurulumun firması. */
  host: text('host').unique(),
  /** Firmaya ayrı veritabanı: şifreli bağlantı adresi (boşsa ana veritabanı). */
  dataUrlEnc: text('data_url_enc'),
  /** Müşterinin kendi sunucusundaki kurulumun merkezden ayar çekerken kullandığı anahtarın özeti (SHA-256). */
  installTokenHash: text('install_token_hash'),
  /** Resmî unvan, vergi/sicil, iletişim, ana IBAN, mali müşavir (bkz. core/company/profile.ts). */
  profile: jsonb('profile').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
