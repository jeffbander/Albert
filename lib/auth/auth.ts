/**
 * NextAuth.js Configuration
 *
 * This module configures NextAuth v5 for the Albert voice assistant.
 * Supports Google and GitHub OAuth providers with database session storage.
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db/drizzle';
import type { DefaultSession } from 'next-auth';

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

// Only use database adapter if TURSO_DATABASE_URL is set (runtime only)
const adapter = process.env.TURSO_DATABASE_URL ? DrizzleAdapter(db) : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Use Drizzle adapter for database session storage (only at runtime)
  adapter,

  // Configure OAuth providers (only include if credentials are available)
  providers: [
    // Google OAuth - only if credentials are set
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: 'consent',
                access_type: 'offline',
                response_type: 'code',
              },
            },
          }),
        ]
      : []),
    // GitHub OAuth - only if credentials are set
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  // Use JWT sessions when no adapter, database sessions otherwise
  session: {
    strategy: adapter ? 'database' : 'jwt',
    // Session expires after 30 days
    maxAge: 30 * 24 * 60 * 60, // 30 days
    // Update session expiry every 24 hours
    updateAge: 24 * 60 * 60, // 24 hours
  },

  // Custom pages (optional - uncomment to use custom pages)
  // pages: {
  //   signIn: '/auth/signin',
  //   signOut: '/auth/signout',
  //   error: '/auth/error',
  // },

  // Callbacks for customizing behavior
  callbacks: {
    // Add user ID to the session (handles both JWT and database sessions)
    session: ({ session, user, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: user?.id || token?.sub || '',
      },
    }),
    // For JWT sessions, add user id to token
    jwt: ({ token, user }) => {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },

    // Control if a user is allowed to sign in
    signIn: async ({ user, account, profile }) => {
      // Allow all users to sign in by default
      // Add custom logic here if you want to restrict access
      // e.g., check against an allowlist of emails
      console.log(`[Auth] User ${user.email} signed in via ${account?.provider}`);
      return true;
    },

    // Called when a new user is created
    // Use this for any post-registration logic
  },

  // Events for logging and side effects
  events: {
    signIn: async ({ user, account, isNewUser }) => {
      if (isNewUser) {
        console.log(`[Auth] New user created: ${user.email}`);
      }
    },
    signOut: async () => {
      console.log(`[Auth] User signed out`);
    },
  },

  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Trust the host header (required for some deployments)
  trustHost: true,
});
