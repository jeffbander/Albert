'use client';

/**
 * Auth Provider Component
 *
 * Wraps the application with NextAuth's SessionProvider.
 * This enables useSession hook throughout the app.
 */

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
