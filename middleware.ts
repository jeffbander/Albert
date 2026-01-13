/**
 * NextAuth.js Middleware
 *
 * This middleware protects specified API routes by requiring authentication.
 * Unauthenticated requests to protected routes will receive a 401 response.
 */

import { auth } from '@/lib/auth/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthenticated = !!req.auth;

  // If not authenticated and accessing protected route, return 401
  if (!isAuthenticated) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'You must be signed in to access this resource',
      },
      { status: 401 }
    );
  }

  // User is authenticated, continue to the route
  return NextResponse.next();
});

// Configure which routes to protect
export const config = {
  matcher: [
    // Protect NotebookLM research routes
    '/api/notebooklm/:path*',

    // Protect Gmail integration routes
    '/api/gmail/:path*',

    // Protect browser automation routes
    '/api/browser/:path*',

    // Protect build/deployment routes
    '/api/build/:path*',

    // Protect self-improvement routes
    '/api/self-improve/:path*',

    // Protect memory routes
    '/api/memory/:path*',

    // Note: /api/conversation/* routes use PasscodeGate client-side auth instead

    // Protect codebase routes
    '/api/codebase/:path*',

    // Note: /api/speakers/* routes use PasscodeGate client-side auth instead

    // Note: /api/auth/* routes are NOT protected (NextAuth handles its own auth)
    // Note: /api/realtime/* routes can be protected if needed
  ],
};
