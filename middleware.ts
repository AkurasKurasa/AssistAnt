import { NextResponse, type NextRequest } from 'next/server';

// Gives each browser a random visitor ID, so the public demo can keep visitors apart.
// The page sets it before the app's first API calls, so parallel requests share one ID.
// Locally the ID is ignored (lib/visitor.ts), so this changes nothing there.
const COOKIE = 'aa_vid';
const ID = /^[a-z0-9-]{8,64}$/i;

export function middleware(req: NextRequest) {
  const existing = req.cookies.get(COOKIE)?.value;
  const vid = existing && ID.test(existing) ? existing : crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set('x-visitor-id', vid);
  const res = NextResponse.next({ request: { headers } });
  if (vid !== existing) {
    res.cookies.set(COOKIE, vid, { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', maxAge: 60 * 60 * 24 * 30, path: '/' });
  }
  return res;
}

export const config = { matcher: ['/', '/api/:path*'] };
