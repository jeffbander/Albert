/**
 * Authentication Types
 *
 * Type definitions for authentication-related functionality.
 */

import type { DefaultSession } from 'next-auth';

/**
 * Extended session user type with ID
 */
export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/**
 * Extended session type
 */
export interface ExtendedSession extends DefaultSession {
  user: SessionUser;
}

/**
 * OAuth provider types supported by the application
 */
export type OAuthProvider = 'google' | 'github';

/**
 * Authentication status
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Sign-in options
 */
export interface SignInOptions {
  provider?: OAuthProvider;
  callbackUrl?: string;
  redirect?: boolean;
}

/**
 * Sign-out options
 */
export interface SignOutOptions {
  callbackUrl?: string;
  redirect?: boolean;
}

/**
 * Protected route configuration
 */
export interface ProtectedRouteConfig {
  requireAuth: boolean;
  redirectTo?: string;
  allowedRoles?: string[];
}
