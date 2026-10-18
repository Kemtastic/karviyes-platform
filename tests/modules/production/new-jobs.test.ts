import { describe, expect, it } from 'vitest';
import { newJobIds } from '@/modules/production/ui/new-jobs';

describe('bölüm ekranı yeni iş', () => {
  it('yalnızca daha önce görülmemiş işler yenidir', () => {
    expect(newJobIds(new Set(['a', 'b']), [{ id: 'a' }, { id: 'c' }, { id: 'd' }])).toEqual(['c', 'd']);
    expect(newJobIds(new Set(['a']), [{ id: 'a' }])).toEqual([]);
    expect(newJobIds(new Set(), [])).toEqual([]);
  });
});
