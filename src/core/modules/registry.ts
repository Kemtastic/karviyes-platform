import { AppError } from '@/core/errors';
import { ordersManifest } from '@/modules/orders/manifest';
import { productionManifest } from '@/modules/production/manifest';
import { salesManifest } from '@/modules/sales/manifest';
import type { InstallConfig } from '@/core/install-config';
import { MODULE_IDS, type ModuleId, type ModuleManifest } from './types';

export const MANIFESTS: Record<ModuleId, ModuleManifest> = { orders: ordersManifest, production: productionManifest, sales: salesManifest };

// Kayıt sırası (MODULE_IDS) bağımlılık sırasıdır.
export function enabledModules(cfg: InstallConfig): ModuleManifest[] {
  return MODULE_IDS.filter((id) => cfg.modules.includes(id)).map((id) => MANIFESTS[id]);
}

export function isModuleEnabled(id: ModuleId, cfg: InstallConfig): boolean {
  return cfg.modules.includes(id);
}

export function requireModule(id: ModuleId, cfg: InstallConfig): void {
  if (!isModuleEnabled(id, cfg)) throw new AppError('MODULE_DISABLED', 'Bu modül bu kurulumda açık değil.');
}

