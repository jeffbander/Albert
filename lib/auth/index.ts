/**
 * Auth Library Exports
 *
 * Re-exports all authentication-related utilities for easier imports.
 */

// NextAuth configuration and handlers
export { auth, signIn, signOut, handlers } from './auth';

// Helper functions for getting user in API routes
export {
  getCurrentUser,
  getSession,
  isAuthenticated,
  getOptionalUser,
  requireAuth,
  UnauthorizedError,
  type AuthUser,
} from './get-user';
