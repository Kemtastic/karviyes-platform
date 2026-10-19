import { cache } from 'react';
import { eq } from 'drizzle-orm';
import type { Db } from '@/core/db/client';
import { companySettings } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import { getInstallConfig, parseInstallConfig, type InstallConfig } from '@/core/install-config';

export type CompanySettingsRow = typeof companySettings.$inferSelect;

/** Kurulum ayarı + firmanın veritabanındaki ayarları (dolu alanlar üstün gelir). Bağımlılıklar yeniden denetlenir. */
export function mergeCompanyConfig(base: InstallConfig, row: Pick<CompanySettingsRow, 'modules' | 'sector' | 'twoFactorRoles' | 'features'> | undefined): InstallConfig {
  if (!row) return base;
  return parseInstallConfig({
    ...base,
    modules: row.modules?.length ? row.modules : base.modules,
    sector: row.sector ?? base.sector,
    security: { twoFactorRequiredRoles: row.twoFactorRoles ?? base.security.twoFactorRequiredRoles },
    features: { ...base.features, ...row.features },
  });
}

export async function loadCompanyConfig(db: Db, companyId: string, base: InstallConfig = getInstallConfig()): Promise<InstallConfig> {
  const [row] = await withCompany(companyId, (tx) => tx.select().from(companySettings).where(eq(companySettings.companyId, companyId)), db);
  return mergeCompanyConfig(base, row);
}

/** Bu isteğin firma ayarı (oturum yoksa kurulum ayarı). Aynı istekte bir kez okunur. */
export const getConfig = cache(async (): Promise<InstallConfig> => {
  const [{ getCurrentUser }, { getDb }] = await Promise.all([import('@/core/auth/session'), import('@/core/db/client')]);
  const user = await getCurrentUser();
  if (!user) return getInstallConfig();
  return loadCompanyConfig(await getDb(), user.companyId);
});
