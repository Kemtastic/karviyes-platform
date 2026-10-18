import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC = ['/giris', '/iki-adim', '/parola-sifirla', '/davet', '/mutabakat', '/api/auth', '/api/saglik', '/api/mutabakat'];

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function secure(res: NextResponse, csp: string | null): NextResponse {
  // API yanıtları belge değildir; CSP'yi gerekirse yanıtın kendisi verir (ör. dosya ucunda sandbox).
  if (csp) res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return res;
}

// Her yanıta güvenlik başlıkları; oturum çerezi yoksa girişe yönlendirme.
// Asıl oturum doğrulaması (app) düzeninde ve her action'da yapılır.
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!isPublic && !getSessionCookie(req)) {
    if (pathname.startsWith('/api/')) {
      return secure(NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' }, { status: 401 }), csp);
    }
    return secure(NextResponse.redirect(new URL('/giris', req.url)), csp);
  }

  // Next.js, istek başlığındaki CSP'den nonce'u alıp kendi betiklerine ekler.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  return secure(NextResponse.next({ request: { headers: requestHeaders } }), pathname.startsWith('/api/') ? null : csp);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
