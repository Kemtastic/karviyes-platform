import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('güvenlik başlıkları', () => {
  it('herkese açık sayfada başlıklar var', () => {
    const res = proxy(new NextRequest('http://localhost:3000/giris'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
  });

  it('girişe yönlendirmede de başlıklar var', () => {
    const res = proxy(new NextRequest('http://localhost:3000/siparisler'));
    expect(res.status).toBe(307);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('oturumsuz API isteği 401 JSON', async () => {
    const res = proxy(new NextRequest('http://localhost:3000/api/siparisler'));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  });
});
