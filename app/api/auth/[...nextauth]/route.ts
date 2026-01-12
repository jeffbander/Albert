/**
 * NextAuth.js API Route Handler
 *
 * This file exports the NextAuth handlers for the /api/auth/* routes.
 * Handles all authentication-related requests (signin, signout, session, etc.)
 */

// Force dynamic rendering to prevent build-time database connection
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { handlers } from '@/lib/auth/auth';

export const { GET, POST } = handlers;
