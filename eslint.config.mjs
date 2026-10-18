import next from 'eslint-config-next';
import nextTs from 'eslint-config-next/typescript';

export default [
  ...next,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'coverage/**', 'playwright-report/**', '.superpowers/**', 'next-env.d.ts'] },
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
];
