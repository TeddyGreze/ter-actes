import { NextResponse } from 'next/server';

export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  // Cookie indicateur côté 3000 pour le middleware
  res.cookies.set('is_admin', '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24, // 1 jour
  });
  return res;
}
