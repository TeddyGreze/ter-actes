// web/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/admin/login'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Lis les cookies une seule fois
  const hasJwt = !!req.cookies.get('access_token')?.value;
  const isAdminFlag = req.cookies.get('is_admin')?.value === '1'; // fallback éventuel

  // ✅ Déjà connecté → empêcher l'accès à /admin/login et rediriger vers le tableau de bord
  if (pathname === '/admin/login' && (hasJwt || isAdminFlag)) {
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  // 🔒 Protège tout /admin/* sauf /admin/login
  if (pathname.startsWith('/admin') && !PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    if (!hasJwt && !isAdminFlag) {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('next', pathname + search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
