import { describe, expect, it } from 'vitest';
import { classifyAlerts } from '@/modules/production/server/alerts';

const order = (id: string, deliveryDate: string, quantity = 1000, shipped = 0) => ({ id, no: `S-${id}`, partyName: 'Müşteri', deliveryDate, quantity, shipped });
const job = (id: string, stage: string, updatedAt: string, fabricReserved = true, createdAt = updatedAt) => ({ id, no: `S-${id}/1`, partyName: 'Müşteri', stage, fabricReserved, createdAt, updatedAt });

describe('üretim uyarıları', () => {
  const today = '2026-10-18';

  it('teslim tarihi geçen ve 3 gün içinde gelen sevk edilmemiş siparişler; tamamı sevk edilen uyarı vermez', () => {
    const a = classifyAlerts([order('gec', '2026-10-15'), order('bugun', '2026-10-18'), order('yakin', '2026-10-21'), order('uzak', '2026-10-22'), order('bitti', '2026-10-10', 500, 500)], [], today);
    expect(a.map((x) => [x.kind, x.title])).toEqual([
      ['late', 'Müşteri · S-gec'],
      ['due_soon', 'Müşteri · S-yakin'],
      ['due_soon', 'Müşteri · S-bugun'],
    ]);
    expect(a[0]!.detail).toContain('3 gün geçti; 1.000 adet');
    expect(a[2]!.detail).toBe('Teslim bugün; 1.000 adet bekliyor.');
  });

  it('aynı aşamada 3 gün hareketsiz iş uyarı, 6 gün tehlike; kumaş bekleyen iş 2 günde uyarı', () => {
    const a = classifyAlerts([], [job('a', 'cutting', '2026-10-15'), job('b', 'printing', '2026-10-12'), job('c', 'cutting', '2026-10-17'), job('k', 'waiting', '2026-10-16', false), job('y', 'waiting', '2026-10-18', false)], today, (s) => ({ cutting: 'Kesim', printing: 'Baskı' })[s] ?? s);
    expect(a.map((x) => [x.kind, x.severity, x.days])).toEqual([
      ['stuck', 'danger', 6],
      ['stuck', 'warning', 3],
      ['fabric_wait', 'warning', 2],
    ]);
    expect(a[0]!.detail).toBe('6 gündür Baskı aşamasında; hareket yok.');
  });
});
