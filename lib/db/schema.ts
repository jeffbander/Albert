/**
 * Database Schema for NextAuth.js
 *
 * This file defines the Drizzle ORM schema for NextAuth authentication tables.
 * These tables are required by NextAuth for managing users, accounts, sessions,
 * and email verification tokens.
 */

import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import type { AdapterAccountType } from 'next-auth/adapters';

/**
 * Users table - stores basic user information
 */
export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('email_verified', { mode: 'timestamp_ms' }),
  image: text('image'),
  // Custom fields for Albert
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date()),
});

/**
 * Accounts table - stores OAuth provider account information
 * Links users to their OAuth providers (Google, GitHub, etc.)
 */
export const accounts = sqliteTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

/**
 * Sessions table - stores active user sessions
 * Used for database session strategy (alternative to JWT)
 */
export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Verification tokens table - stores email verification tokens
 * Used for email sign-in and email verification flows
 */
export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (verificationToken) => ({
    compoundKey: primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  })
);

/**
 * Authenticators table - stores WebAuthn authenticators (optional)
 * Used for passkey/WebAuthn authentication
 */
export const authenticators = sqliteTable(
  'authenticators',
  {
    credentialID: text('credential_id').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerAccountId: text('provider_account_id').notNull(),
    credentialPublicKey: text('credential_public_key').notNull(),
    counter: integer('counter').notNull(),
    credentialDeviceType: text('credential_device_type').notNull(),
    credentialBackedUp: integer('credential_backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
  },
  (authenticator) => ({
    compoundKey: primaryKey({
      columns: [authenticator.userId, authenticator.credentialID],
    }),
  })
);

// Type exports for use throughout the application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;

// ============================================
// Research Session Schema Types
// (Using raw SQL with @libsql/client, not Drizzle)
// ============================================

import type { ResearchPhase } from '@/types/research';

export type ResearchSessionStatus = 'active' | 'paused' | 'closed';

/**
 * Database row type for research_sessions table
 */
export interface ResearchSessionRow {
  id: string;
  user_id: string;
  topic: string;
  status: ResearchSessionStatus;
  phase: ResearchPhase;
  notebook_url: string | null;
  tab_id: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Application-level type for research sessions (parsed from database)
 */
export interface DbResearchSession {
  id: string;
  userId: string;
  topic: string;
  status: ResearchSessionStatus;
  phase: ResearchPhase;
  notebookUrl: string | null;
  tabId: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Research Source Schema
// ============================================

export type ResearchSourceType = 'url' | 'youtube' | 'google_doc' | 'text' | 'pdf';
export type ResearchSourceStatus = 'pending' | 'added' | 'failed';

/**
 * Database row type for research_sources table
 */
export interface ResearchSourceRow {
  id: string;
  session_id: string;
  type: ResearchSourceType;
  content: string;
  description: string | null;
  status: ResearchSourceStatus;
  added_at: string;
}

/**
 * Application-level type for research sources (parsed from database)
 */
export interface DbResearchSource {
  id: string;
  sessionId: string;
  type: ResearchSourceType;
  content: string;
  description: string | null;
  status: ResearchSourceStatus;
  addedAt: Date;
}

// ============================================
// Research Question Schema
// ============================================

/**
 * Database row type for research_questions table
 */
export interface ResearchQuestionRow {
  id: string;
  session_id: string;
  question: string;
  answer: string | null;
  asked_at: string;
  answered_at: string | null;
}

/**
 * Application-level type for research questions (parsed from database)
 */
export interface DbResearchQuestion {
  id: string;
  sessionId: string;
  question: string;
  answer: string | null;
  askedAt: Date;
  answeredAt: Date | null;
}

// ============================================
// Combined Session with Relations
// ============================================

/**
 * Full research session with sources and questions loaded
 */
export interface DbResearchSessionWithRelations extends DbResearchSession {
  sources: DbResearchSource[];
  questions: DbResearchQuestion[];
}

// ============================================
// Input Types for Creating/Updating
// ============================================

export interface CreateResearchSessionInput {
  userId: string;
  topic: string;
  status?: ResearchSessionStatus;
  phase?: ResearchPhase;
}

export interface UpdateResearchSessionInput {
  status?: ResearchSessionStatus;
  phase?: ResearchPhase;
  notebookUrl?: string | null;
  tabId?: number | null;
  error?: string | null;
}

export interface CreateResearchSourceInput {
  sessionId: string;
  type: ResearchSourceType;
  content: string;
  description?: string;
}

export interface CreateResearchQuestionInput {
  sessionId: string;
  question: string;
}

// ============================================
// Row Parsers
// ============================================

/**
 * Parse a database row into a DbResearchSession object
 */
export function parseResearchSessionRow(row: Record<string, unknown>): DbResearchSession {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    topic: row.topic as string,
    status: row.status as ResearchSessionStatus,
    phase: row.phase as ResearchPhase,
    notebookUrl: row.notebook_url as string | null,
    tabId: row.tab_id as number | null,
    error: row.error as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Parse a database row into a DbResearchSource object
 */
export function parseResearchSourceRow(row: Record<string, unknown>): DbResearchSource {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    type: row.type as ResearchSourceType,
    content: row.content as string,
    description: row.description as string | null,
    status: row.status as ResearchSourceStatus,
    addedAt: new Date(row.added_at as string),
  };
}

/**
 * Parse a database row into a DbResearchQuestion object
 */
export function parseResearchQuestionRow(row: Record<string, unknown>): DbResearchQuestion {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    question: row.question as string,
    answer: row.answer as string | null,
    askedAt: new Date(row.asked_at as string),
    answeredAt: row.answered_at ? new Date(row.answered_at as string) : null,
  };
}
