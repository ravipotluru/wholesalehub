import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

  // Public auth flows: password reset must work signed-out by definition,
  // and the email-verification confirm page is reached from a mail client
  // (often without a session). The base /verify-email page stays protected —
  // it personalizes from the session.
  if (
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email/confirm')
  ) {
    return NextResponse.next();
  }

  // Allow auth pages for unauthenticated users
  if (isAuthPage) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/marketplace', req.url));
    }
    return NextResponse.next();
  }

  // Allow API routes (they handle auth internally) and public assets
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Require auth for everything else
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
