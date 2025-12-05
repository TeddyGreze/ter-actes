// web/src/app/api/session/clear/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const res = new NextResponse(null, { status: 204 });

  // Supprime l'indicateur (si jamais encore utilisé)
  res.cookies.set('is_admin', '', {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 0,
  });

  // Supprime aussi le vrai JWT côté navigateur (même host: localhost)
  // Comme les cookies sont par "host" (pas par port), 3000 peut effacer celui posé par 8000.
  res.cookies.set('access_token', '', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 0,
  });

  return res;
}
