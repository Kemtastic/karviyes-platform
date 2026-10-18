import { describe, expect, it } from 'vitest';
import { readBodyCapped, uploadPrecheck } from '@/core/files/upload';
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
  it('boyutu bildirilmeyen gövde sınırla okunur: sınırı aşan kesilir, küçük olan okunur', async () => {
    const stream = (bytes: number) => new Request('https://firma.example/api/files', { method: 'POST', body: new Uint8Array(bytes) });
    expect(await readBodyCapped(stream(2000), 1000)).toBeNull();
    expect((await readBodyCapped(stream(500), 1000))?.byteLength).toBe(500);
  });
  it('uygun istek geçer', () => {
    expect(uploadPrecheck(req({ origin: 'https://firma.example', 'content-length': '1000' }), true)).toBeNull();
  });
});
