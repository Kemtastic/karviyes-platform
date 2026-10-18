import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { MODULE_IDS, ROLES, type ModuleId } from './modules/types';
import { MANIFESTS } from './modules/registry';

const schema = z.object({
  company: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug yalnızca küçük harf, rakam ve tire içerebilir'),
    logoUrl: z.string().url().optional(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    domain: z.string().optional(),
  }),
  modules: z.array(z.string()).min(1),
  sector: z.literal('bags'),
  security: z.object({ twoFactorRequiredRoles: z.array(z.enum(ROLES)).default(['admin', 'accounting', 'tracking']) }).default({}),
});

export type InstallConfig = Omit<z.infer<typeof schema>, 'modules'> & { modules: ModuleId[] };

export function parseInstallConfig(raw: unknown): InstallConfig {
  const parsed = schema.parse(raw);
  const unknown = parsed.modules.filter((m) => !(MODULE_IDS as readonly string[]).includes(m));
  if (unknown.length) throw new Error(`Bilinmeyen modül: ${unknown.join(', ')}`);
  const modules = parsed.modules as ModuleId[];
  for (const id of modules) {
    for (const dep of MANIFESTS[id].dependsOn) {
      if (!modules.includes(dep)) throw new Error(`${id} modülü ${dep} modülüne bağlı; ${dep} de açılmalı.`);
    }
  }
  return { ...parsed, modules };
}

let cached: InstallConfig | undefined;

// Kurulum ayarı: INSTALL_CONFIG_PATH dosyası, yoksa INSTALL_CONFIG_JSON, yoksa kurulum.config.json.
export function getInstallConfig(): InstallConfig {
  if (cached) return cached;
  const json = process.env.INSTALL_CONFIG_JSON ?? readFileSync(/* turbopackIgnore: true */ process.env.INSTALL_CONFIG_PATH ?? 'kurulum.config.json', 'utf8');
  cached = parseInstallConfig(JSON.parse(json));
  return cached;
}
