import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'crisis-sim-default-secret-key-32-chars-min!!',
  cookieName: 'crisis-sim-session',
};

const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/api/auth/login', '/api/auth/register'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/'
  ) {
    return NextResponse.next();
  }

  // For API routes (not auth), check session via cookie header
  if (pathname.startsWith('/api/')) {
    // API routes handle auth themselves
    return NextResponse.next();
  }

  // For protected pages, check cookie existence (lightweight check)
  const cookie = req.cookies.get('crisis-sim-session');
  if (!cookie) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard',
    '/new',
    '/sim/:path*',
    '/leaderboard',
    '/analytics',
    '/achievements',
    '/templates',
    '/compare',
    '/settings',
  ],
};
