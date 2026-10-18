import { describe, expect, it } from 'vitest';
import { bags } from '@/sectors/bags';
import { initialJobState, transition, type JobState } from '@/modules/production/domain/state-machine';

const printed = bags.validateProduct({ width: 45, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 3, print: 'siyah', biye: 5 });
const plain = bags.validateProduct({ width: 45, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 3, noPrint: true, biye: 5 });
const threeD = bags.validateProduct({ width: 45, height: 45, shape: '3D', gusset: 10, handle: 'El Geçme', gsm: 70, rolls: 3, print: 'siyah', biye: 5 });

const run = (product: typeof printed, events: Parameters<typeof transition>[1][], start: JobState = initialJobState()) =>
  events.reduce((s, e) => transition(s, e, bags, product), start);

describe('iş durum makinesi', () => {
  it('baskılı iş kumaş ayrılmadan dilimlemeye gönderilemez', () => {
    expect(() => run(printed, [{ type: 'send', stage: 'slitting' }])).toThrow(/kumaş/i);
  });

  it('tam akış: kumaş → dilimleme → baskı → kesim → bitiş → kontrol → tamamlandı', () => {
    const s = run(printed, [
      { type: 'reserveFabric' },
      { type: 'send', stage: 'slitting' }, { type: 'start' }, { type: 'finish' },
      { type: 'start' }, { type: 'finish' },
      { type: 'start' }, { type: 'finish', good: 6600 },
      { type: 'start' }, { type: 'finish', good: 6550 },
      { type: 'approve' },
    ]);
    expect(s).toMatchObject({ stage: 'completed', producedQty: 6550 });
  });

  it('dilimlemeden sonra baskılı iş baskıya, baskısız iş kesime geçer', () => {
    const base = [{ type: 'reserveFabric' as const }, { type: 'send' as const, stage: 'slitting' }, { type: 'start' as const }, { type: 'finish' as const }];
    expect(run(printed, base).stage).toBe('printing');
    expect(run(plain, base).stage).toBe('cutting');
  });

  it('baskılı iş doğrudan kesime gönderilemez', () => {
    expect(() => run(printed, [{ type: 'reserveFabric' }, { type: 'send', stage: 'cutting' }])).toThrow(/baskı/i);
  });

  it('başlatılmamış aşama bitirilemez, başlamış aşama yeniden başlatılamaz', () => {
    const sent = run(printed, [{ type: 'reserveFabric' }, { type: 'send', stage: 'slitting' }]);
    expect(() => transition(sent, { type: 'finish' }, bags, printed)).toThrow();
    const started = transition(sent, { type: 'start' }, bags, printed);
    expect(() => transition(started, { type: 'start' }, bags, printed)).toThrow();
  });

  it('kontrolden bölüme geri gönderme ve tekrar onay', () => {
    const atReview = run(plain, [{ type: 'reserveFabric' }, { type: 'send', stage: 'cutting' }, { type: 'start' }, { type: 'finish', good: 6600 }, { type: 'start' }, { type: 'finish', good: 6600 }]);
    expect(atReview.stage).toBe('review');
    const back = transition(atReview, { type: 'returnFromReview', to: 'finishing' }, bags, plain);
    expect(back).toMatchObject({ stage: 'finishing', stageStatus: 'waiting' });
  });

  it('tamir: bitişten tamire, tamirden bitişe döner', () => {
    const atFinishing = run(plain, [{ type: 'reserveFabric' }, { type: 'send', stage: 'cutting' }, { type: 'start' }, { type: 'finish', good: 6600 }]);
    const repair = transition(atFinishing, { type: 'toRepair' }, bags, plain);
    expect(repair.stage).toBe('repair');
    const back = run(plain, [{ type: 'start' }, { type: 'finish', good: 120 }], repair);
    expect(back.stage).toBe('finishing');
  });

  it('çevirme yalnızca 3D işte', () => {
    const atFinishing = (p: typeof printed) => run(p, [{ type: 'reserveFabric' }, { type: 'send', stage: 'slitting' }, { type: 'start' }, { type: 'finish' }, { type: 'start' }, { type: 'finish' }, { type: 'start' }, { type: 'finish', good: 6000 }]);
    expect(() => transition(atFinishing(printed), { type: 'toTurning' }, bags, printed)).toThrow(/3D/);
    expect(transition(atFinishing(threeD), { type: 'toTurning' }, bags, threeD).stage).toBe('turning');
  });

  it('kısmi sevk; tamamı sevk edilince "sevk edildi"; fazlası reddedilir', () => {
    const done = run(plain, [{ type: 'reserveFabric' }, { type: 'send', stage: 'cutting' }, { type: 'start' }, { type: 'finish', good: 1000 }, { type: 'start' }, { type: 'finish', good: 1000 }, { type: 'approve' }]);
    const partial = transition(done, { type: 'ship', qty: 400 }, bags, plain);
    expect(partial).toMatchObject({ stage: 'completed', shippedQty: 400 });
    expect(() => transition(partial, { type: 'ship', qty: 601 }, bags, plain)).toThrow(/fazla/i);
    expect(transition(partial, { type: 'ship', qty: 600 }, bags, plain)).toMatchObject({ stage: 'shipped', shippedQty: 1000 });
  });

  it('iptal edilmiş iş başlatılamaz; sevk edilmiş iş iptal edilemez', () => {
    const cancelled = run(plain, [{ type: 'reserveFabric' }, { type: 'cancel' }]);
    expect(cancelled.stage).toBe('cancelled');
    expect(() => transition(cancelled, { type: 'send', stage: 'cutting' }, bags, plain)).toThrow();
  });
});
