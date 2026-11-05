import { NextResponse, type NextRequest } from 'next/server';

// Gives each browser a random visitor ID, so the public demo can keep visitors apart.
// The page sets it before the app's first API calls, so parallel requests share one ID.
// Locally the ID is ignored (lib/visitor.ts), so this changes nothing there.
const COOKIE = 'aa_vid';
const ID = /^[a-z0-9-]{8,64}$/i;

export async function middleware(req: NextRequest) {
  // ?code=… (the showcase access code): keep only its SHA-256 in a cookie, and drop it from the URL.
  // The server compares it with DEMO_ACCESS_CODE (lib/visitor.ts); a wrong code simply grants nothing.
  const code = req.nextUrl.searchParams.get('code');
  if (code) {
    const url = req.nextUrl.clone(); url.searchParams.delete('code');
    const res = NextResponse.redirect(url);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)))).map((b) => b.toString(16).padStart(2, '0')).join('');
    res.cookies.set('aa_pass', hash, { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', maxAge: 60 * 60 * 24 * 30, path: '/' });
    return res;
  }
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
