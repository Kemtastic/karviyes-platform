import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  // Çekirdek ve modül tabloları tek göç zincirinde.
  schema: ['./src/core/db/schema/index.ts', './src/modules/*/db/schema.ts'],
  out: './drizzle',
});
