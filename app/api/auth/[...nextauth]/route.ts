/**
 * NextAuth.js API Route Handler
 *
 * This file exports the NextAuth handlers for the /api/auth/* routes.
 * Handles all authentication-related requests (signin, signout, session, etc.)
 */

import { handlers } from '@/lib/auth/auth';

export const { GET, POST } = handlers;
