import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC = ['/giris', '/iki-adim', '/parola-sifirla', '/davet', '/api/auth', '/api/saglik'];

// Hızlı ön kontrol: oturum çerezi yoksa girişe yönlendir. Asıl doğrulama (app) düzeninde ve her action'da yapılır.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  if (!getSessionCookie(req)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/giris', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
