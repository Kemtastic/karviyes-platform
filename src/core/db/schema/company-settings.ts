import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Firmanın çalışma ayarları (merkez panelden yönetilir). Alan boşsa kurulum ayarı geçerlidir.
export const companySettings = pgTable('company_settings', {
  companyId: uuid('company_id').primaryKey(),
  modules: text('modules').array(),
  sector: text('sector'),
  twoFactorRoles: text('two_factor_roles').array(),
  features: jsonb('features').$type<Record<string, boolean>>().notNull().default({}),
  // Firma askıya alınırsa kullanıcılar giriş yapamaz (veri durur, silinmez).
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  /** Müşteri sunucusunda: son uygulanan merkez paketinin düzenlenme zamanı (eski paketin yeniden oynatılmasını engeller). */
  centralIssuedAt: timestamp('central_issued_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});
