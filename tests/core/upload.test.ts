import { describe, expect, it } from 'vitest';
import { uploadPrecheck } from '@/core/files/upload';
import { MAX_FILE_BYTES } from '@/core/files/service';

const req = (headers: Record<string, string> = {}) => new Request('https://firma.example/api/files', { method: 'POST', headers, body: 'x' });

describe('yükleme ön kontrolü (gövde okunmadan)', () => {
  it('oturum yoksa 401 ve gövde okunmaz', () => {
    const r = req();
    expect(uploadPrecheck(r, false)?.status).toBe(401);
    expect(r.bodyUsed).toBe(false);
  });
  it('başka kaynaktan istek 403', () => {
    expect(uploadPrecheck(req({ origin: 'https://kotu.example' }), true)?.status).toBe(403);
  });
  it('bildirilen boyut sınırın çok üstündeyse 413', () => {
    expect(uploadPrecheck(req({ 'content-length': String(MAX_FILE_BYTES * 2) }), true)?.status).toBe(413);
  });
  it('uygun istek geçer', () => {
    expect(uploadPrecheck(req({ origin: 'https://firma.example', 'content-length': '1000' }), true)).toBeNull();
  });
});
