/**
 * Authentication Helper Functions
 *
 * Utilities for getting the current user in API routes and server components.
 */

import { auth } from './auth';

/**
 * User type returned by getCurrentUser
 */
export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/**
 * Error thrown when a user is not authenticated
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Get the current authenticated user.
 * Throws an UnauthorizedError if not authenticated.
 *
 * @example
 * ```ts
 * // In an API route
 * export async function GET() {
 *   try {
 *     const user = await getCurrentUser();
 *     // User is authenticated, proceed with request
 *     return NextResponse.json({ userId: user.id });
 *   } catch (error) {
 *     if (error instanceof UnauthorizedError) {
 *       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export async function getCurrentUser(): Promise<AuthUser> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };
}

/**
 * Get the current user's session without throwing.
 * Returns null if not authenticated.
 *
 * @example
 * ```ts
 * // In a server component
 * const session = await getSession();
 * if (session) {
 *   // User is signed in
 * }
 * ```
 */
export async function getSession() {
  return await auth();
}

/**
 * Check if the current request is authenticated.
 * Returns true if authenticated, false otherwise.
 *
 * @example
 * ```ts
 * const authenticated = await isAuthenticated();
 * if (!authenticated) {
 *   redirect('/api/auth/signin');
 * }
 * ```
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.id;
}

/**
 * Get the current user or null if not authenticated.
 * Does not throw - useful for optional auth scenarios.
 *
 * @example
 * ```ts
 * const user = await getOptionalUser();
 * if (user) {
 *   // Personalized experience
 * } else {
 *   // Anonymous experience
 * }
 * ```
 */
export async function getOptionalUser(): Promise<AuthUser | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };
}

/**
 * Require authentication in an API route.
 * Returns a helper function that returns an error response if not authenticated.
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const { user, errorResponse } = await requireAuth();
 *   if (errorResponse) return errorResponse;
 *
 *   // User is authenticated
 *   // ...
 * }
 * ```
 */
export async function requireAuth(): Promise<{
  user: AuthUser | null;
  errorResponse: Response | null;
}> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'You must be signed in to access this resource' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      image: session.user.image ?? null,
    },
    errorResponse: null,
  };
}
