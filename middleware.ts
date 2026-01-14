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

// Configure which routes to protect with NextAuth
// Routes NOT listed here use PasscodeGate client-side authentication instead
export const config = {
  matcher: [
    // Protect Gmail integration routes (OAuth flows)
    '/api/gmail/:path*',

    // Protect build/deployment routes
    '/api/build/:path*',

    // Protect self-improvement routes (writing code changes)
    '/api/self-improve/:path*',

    // The following routes are open for voice tools (with their own security):
    // - /api/codebase/* (read-only, has ALLOWED_DIRS restriction)
    // - /api/browser/* (voice tool browser control)
    // - /api/notebooklm/* (voice tool research)
    // - /api/memory/* (voice tool memory)
    // - /api/conversation/* (voice conversations)
    // - /api/speakers/* (speaker profiles)
    // - /api/graph/* (knowledge graph)
    // - /api/realtime/* (voice sessions)
    // - /api/auth/* (NextAuth handles its own auth)
  ],
};
