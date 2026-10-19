import type { InstallConfig } from '@/core/install-config';
import type { ModuleId } from '@/core/modules/types';

// Firma başına açılıp kapanan küçük seçenekler (merkez panel). Her anahtarın kodda gerçek bir etkisi vardır.
export const FEATURES = [
  { key: 'orders.requireDeliveryDate', module: 'orders', label: 'Siparişte teslim tarihi zorunlu', hint: 'Yeni siparişte teslim tarihi girilmeden kayıt yapılmaz.', default: false },
  { key: 'finance.reconciliationEmail', module: 'finance', label: 'Mutabakat e-postayla gönderilebilir', hint: 'Kapalıysa mutabakat bağlantısı yalnız kopyalanıp iletilir.', default: true },
] as const satisfies readonly { key: string; module: ModuleId; label: string; hint: string; default: boolean }[];

export type FeatureKey = (typeof FEATURES)[number]['key'];

export function feature(cfg: Pick<InstallConfig, 'features'>, key: FeatureKey): boolean {
  const own = cfg.features?.[key];
  return own ?? FEATURES.find((f) => f.key === key)!.default;
}
