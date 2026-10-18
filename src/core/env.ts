import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL tanımlı değil' }).min(1),
  DB_APP_ROLE: z.string().optional(),
  BETTER_AUTH_SECRET: z
    .string({ required_error: 'BETTER_AUTH_SECRET tanımlı değil' })
    .min(32, 'BETTER_AUTH_SECRET en az 32 karakter olmalı'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  INSTALL_CONFIG_PATH: z.string().optional(),
  STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
  STORAGE_FS_DIR: z.string().default('.data/files'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Ortam değişkenleri geçersiz:\n${problems.join('\n')}`);
  }
  return result.data;
}

let cached: Env | undefined;

// Modül yüklenirken değil, ilk kullanımda doğrular; testler kendi değerlerini parseEnv ile verir.
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
