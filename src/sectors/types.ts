import type { Role } from '@/core/modules/types';

export type SectorField = {
  key: string;
  label: string;
  type: 'number' | 'integer' | 'select' | 'text' | 'boolean';
  unit?: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  hint?: string;
};

export type StageId = string;

export type StageDef = {
  id: StageId;
  label: string;
  role: Role;
  /** Bitirirken istenen sonuç alanları (sağlam adet, fire vb.). */
  finishFields: SectorField[];
};

export type Product = Record<string, unknown>;

/** Üretimin tükettiği bobin malzemesi. gsm null: herhangi gramaj uyar. consumeAt null: işe elle (üretime göndermeden önce) ayrılır. */
export type MaterialNeed = { kind: 'fabric' | 'handle'; label: string; widthCm: number; colour: string; gsm: number | null; rolls: number; consumeAt: StageId | null };

// Bir sektörün (bez çanta, plastik poşet…) ürün alanları, hesapları ve üretim akışı.
// Üretim ve sipariş modülleri sektörü bilmez; yalnızca bu arayüzü kullanır.
export type SectorPackage<P extends Product = Product, C = Record<string, number>> = {
  id: string;
  name: string;
  productFields: SectorField[];
  /** Girdiyi doğrular ve normalize eder; hatada AppError('VALIDATION', …, fieldErrors) fırlatır. */
  validateProduct(input: Record<string, unknown>): P;
  calculate(p: Record<string, unknown>): C;
  /** Siparişin hedef adedi (hesaplardan). */
  targetQuantity(p: P): number;
  stages: StageDef[];
  /** İşin ilk gönderilebileceği aşamalar. */
  firstStages(p: P): StageId[];
  nextStages(p: P, current: StageId): StageId[];
  canSkipTo(p: P, target: StageId): boolean;
  canTurn(p: P): boolean;
  /** Ürünün malzeme ihtiyacı (stok açığı ve otomatik ayırma için). */
  materials(p: P, quantity: number): MaterialNeed[];
  /** Dışa aktarımda bir ürün alanının okunur değeri (varsayılan: değerin kendisi). */
  formatField?(key: string, value: unknown): string | number | null;
  /** Ürünü tek satırda özetler (listeler ve PDF için). */
  describe(p: P): string;
};
