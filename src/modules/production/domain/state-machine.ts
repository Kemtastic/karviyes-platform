import { AppError } from '@/core/errors';
import type { Product, SectorPackage, StageId } from '@/sectors/types';

// Bir işin üretimdeki konumu. stage: sektör aşaması (dilimleme, baskı…) ya da genel durum.
export type JobStage = StageId | 'waiting' | 'review' | 'completed' | 'shipped' | 'cancelled';

export type JobState = {
  stage: JobStage;
  stageStatus: 'waiting' | 'in_progress';
  fabricReserved: boolean;
  producedQty: number;
  shippedQty: number;
};

export type JobEvent =
  | { type: 'reserveFabric' }
  | { type: 'send'; stage: StageId }
  | { type: 'start' }
  | { type: 'finish'; good?: number }
  | { type: 'toRepair' }
  | { type: 'toTurning' }
  | { type: 'approve' }
  | { type: 'returnFromReview'; to: StageId }
  | { type: 'ship'; qty: number }
  | { type: 'reopen' }
  | { type: 'correctQty'; qty: number }
  | { type: 'cancel' };

export const CLOSED: JobStage[] = ['completed', 'shipped', 'cancelled'];

export function initialJobState(): JobState {
  return { stage: 'waiting', stageStatus: 'waiting', fabricReserved: false, producedQty: 0, shippedQty: 0 };
}

const invalid = (message: string) => new AppError('INVALID_STATE', message);

export function isProductionStage(sector: SectorPackage, stage: JobStage): boolean {
  return sector.stages.some((s) => s.id === stage);
}

// Saf geçiş fonksiyonu: geçersiz geçişte Türkçe mesajlı INVALID_STATE fırlatır.
export function transition<P extends Product>(state: JobState, event: JobEvent, sector: SectorPackage<P>, product: P): JobState {
  const s = state;
  const labelOf = (id: JobStage) => sector.stages.find((x) => x.id === id)?.label ?? id;

  switch (event.type) {
    case 'reserveFabric':
      if (s.stage !== 'waiting') throw invalid('Kumaş yalnızca üretime gönderilmemiş işe ayrılabilir.');
      return { ...s, fabricReserved: true };

    case 'send': {
      if (s.stage !== 'waiting') throw invalid('İş zaten üretimde.');
      if (!s.fabricReserved) throw invalid('Önce kumaş ayırın.');
      if (!sector.firstStages(product).includes(event.stage) || !sector.canSkipTo(product, event.stage)) {
        throw invalid(`İş ${labelOf(event.stage)} bölümüne gönderilemez: baskılı iş baskıdan geçmeden kesime gidemez.`);
      }
      return { ...s, stage: event.stage, stageStatus: 'waiting' };
    }

    case 'start':
      if (!isProductionStage(sector, s.stage)) throw invalid('Bu iş şu an bir bölümde değil.');
      if (s.stageStatus === 'in_progress') throw invalid('Bu aşama zaten başlatılmış.');
      return { ...s, stageStatus: 'in_progress' };

    case 'finish': {
      if (!isProductionStage(sector, s.stage)) throw invalid('Bu iş şu an bir bölümde değil.');
      if (s.stageStatus !== 'in_progress') throw invalid('Aşama başlatılmadan bitirilemez.');
      const produced = s.stage === 'finishing' && event.good !== undefined ? event.good : s.producedQty;
      if (s.stage === 'finishing') return { ...s, stage: 'review', stageStatus: 'waiting', producedQty: produced };
      const [next] = sector.nextStages(product, s.stage);
      if (!next) throw invalid('Sonraki aşama tanımlı değil.');
      return { ...s, stage: next, stageStatus: 'waiting', producedQty: produced };
    }

    case 'toRepair':
      if (s.stage !== 'finishing' && s.stage !== 'review') throw invalid('Tamire yalnızca kesim bitiş veya kontroldeki iş gönderilebilir.');
      return { ...s, stage: 'repair', stageStatus: 'waiting' };

    case 'toTurning':
      if (s.stage !== 'finishing') throw invalid('Çevirmeye yalnızca kesim bitişteki iş gönderilebilir.');
      if (!sector.canTurn(product)) throw invalid('Çevirme yalnızca 3D modelde yapılabilir.');
      return { ...s, stage: 'turning', stageStatus: 'waiting' };

    case 'approve':
      if (s.stage !== 'review') throw invalid('Yalnızca kontrol bekleyen iş onaylanabilir.');
      return { ...s, stage: 'completed', stageStatus: 'waiting' };

    case 'returnFromReview':
      if (s.stage !== 'review') throw invalid('Yalnızca kontrol bekleyen iş geri gönderilebilir.');
      if (!isProductionStage(sector, event.to)) throw invalid('Geçerli bir bölüm seçin.');
      return { ...s, stage: event.to, stageStatus: 'waiting' };

    case 'ship': {
      if (s.stage !== 'completed') throw invalid('Yalnızca tamamlanan iş sevk edilir.');
      if (!Number.isInteger(event.qty) || event.qty <= 0) throw new AppError('VALIDATION', 'Sevk adedi sıfırdan büyük tam sayı olmalı.', { qty: 'Geçerli adet girin.' });
      const remaining = s.producedQty - s.shippedQty;
      if (event.qty > remaining) throw new AppError('VALIDATION', `Üretilenden fazla sevk edilemez (kalan ${remaining}).`, { qty: `En fazla ${remaining}.` });
      const shippedQty = s.shippedQty + event.qty;
      return { ...s, shippedQty, stage: shippedQty >= s.producedQty ? 'shipped' : 'completed' };
    }

    case 'reopen':
      if (s.stage !== 'completed' || s.shippedQty > 0) throw invalid('Yalnızca onaylanmış ve hiç sevk edilmemiş iş kontrole geri alınabilir.');
      return { ...s, stage: 'review', stageStatus: 'waiting' };

    case 'correctQty': {
      if (s.stage !== 'review' && s.stage !== 'completed') throw invalid('Adet yalnızca kontroldeki ya da onaylanmış işte düzeltilir.');
      if (!Number.isInteger(event.qty) || event.qty <= 0) throw new AppError('VALIDATION', 'Adet sıfırdan büyük tam sayı olmalı.', { qty: 'Geçerli adet girin.' });
      if (event.qty < s.shippedQty) throw new AppError('VALIDATION', `Sevk edilen ${s.shippedQty} adedin altına düşürülemez.`, { qty: `En az ${s.shippedQty}.` });
      const stage = s.stage === 'completed' && s.shippedQty > 0 && event.qty === s.shippedQty ? 'shipped' : s.stage;
      return { ...s, producedQty: event.qty, stage };
    }

    case 'cancel':
      if (s.stage === 'shipped' || s.stage === 'cancelled' || s.stage === 'completed') throw invalid('Tamamlanmış, sevk edilmiş veya iptal edilmiş iş iptal edilemez.');
      return { ...s, stage: 'cancelled', stageStatus: 'waiting' };
  }
}
