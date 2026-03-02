import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Redirect flaneur.news -> readflaneur.com (preserve path + query)
  const host = request.headers.get('host') || '';
  if (host === 'flaneur.news' || host === 'www.flaneur.news') {
    const url = new URL(request.url);
    url.hostname = 'readflaneur.com';
    url.host = 'readflaneur.com';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
