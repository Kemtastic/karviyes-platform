import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/core/env';

const valid = {
  DATABASE_URL: 'pglite://memory',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
};

describe('parseEnv', () => {
  it('eksik zorunlu değişkenleri adıyla bildirir', () => {
    expect(() => parseEnv({})).toThrowError(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET|BETTER_AUTH_SECRET[\s\S]*DATABASE_URL/);
  });

  it('32 karakterden kısa gizli anahtarı reddeder', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'kisa' })).toThrowError(/BETTER_AUTH_SECRET/);
  });

  it('geçerli girdide depolama sürücüsü varsayılan olarak fs olur', () => {
    expect(parseEnv(valid).STORAGE_DRIVER).toBe('fs');
  });
});
