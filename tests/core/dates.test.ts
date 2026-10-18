import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, istanbulDate, istanbulToday } from '@/core/dates';

describe('İstanbul tarihleri', () => {
  it('23:30 UTC ertesi günün İstanbul tarihidir', () => expect(istanbulDate(new Date('2026-10-17T23:30:00Z'))).toBe('2026-10-18'));
  it('istanbulToday verilen ana göre hesaplar', () => expect(istanbulToday(new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01'));
  it('GG.AA.YYYY', () => expect(formatDate('2026-10-18')).toBe('18.10.2026'));
  it('tarih-saat İstanbul saatiyle', () => expect(formatDateTime(new Date('2026-10-18T07:05:00Z'))).toBe('18.10.2026 10:05'));
});
