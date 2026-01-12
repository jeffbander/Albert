/**
 * Research Repository
 * Database operations for research sessions using @libsql/client
 */

import { createClient, Client } from '@libsql/client';
import type { ResearchPhase } from '@/types/research';
import type {
  DbResearchSession,
  DbResearchSource,
  DbResearchQuestion,
  DbResearchSessionWithRelations,
  ResearchSessionStatus,
  ResearchSourceType,
  ResearchSourceStatus,
  CreateResearchSessionInput,
  UpdateResearchSessionInput,
  CreateResearchSourceInput,
  CreateResearchQuestionInput,
} from './schema';
import {
  parseResearchSessionRow,
  parseResearchSourceRow,
  parseResearchQuestionRow,
} from './schema';

let dbClient: Client | null = null;

function getDb(): Client {
  if (!dbClient) {
    dbClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return dbClient;
}

/**
 * Generate a unique ID for research entities
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * ResearchRepository class providing database operations for research sessions
 */
export class ResearchRepository {
  // ============================================
  // Session Operations
  // ============================================

  /**
   * Create a new research session
   */
  async createSession(userId: string, topic: string): Promise<DbResearchSession> {
    const db = getDb();
    const id = generateId('research');
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO research_sessions (id, user_id, topic, status, phase, created_at, updated_at)
            VALUES (?, ?, ?, 'active', 'initializing', ?, ?)`,
      args: [id, userId, topic, now, now],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM research_sessions WHERE id = ?',
      args: [id],
    });

    if (!result.rows[0]) {
      throw new Error('Failed to create research session');
    }

    console.log(`[ResearchRepository] Created session ${id} for user ${userId}, topic: ${topic}`);
    return parseResearchSessionRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Get a research session by ID
   */
  async getSession(sessionId: string): Promise<DbResearchSession | null> {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM research_sessions WHERE id = ?',
      args: [sessionId],
    });

    if (!result.rows[0]) return null;
    return parseResearchSessionRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Get a research session with all its sources and questions
   */
  async getSessionWithRelations(sessionId: string): Promise<DbResearchSessionWithRelations | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const sources = await this.getSessionSources(sessionId);
    const questions = await this.getSessionQuestions(sessionId);

    return {
      ...session,
      sources,
      questions,
    };
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<DbResearchSession[]> {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM research_sessions WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    });

    return result.rows.map(row => parseResearchSessionRow(row as Record<string, unknown>));
  }

  /**
   * Get the active session for a user (status = 'active')
   */
  async getActiveSession(userId: string): Promise<DbResearchSession | null> {
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT * FROM research_sessions
            WHERE user_id = ? AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1`,
      args: [userId],
    });

    if (!result.rows[0]) return null;
    return parseResearchSessionRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Get any active session (for single-user voice interface)
   */
  async getAnyActiveSession(): Promise<DbResearchSession | null> {
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT * FROM research_sessions
            WHERE status = 'active'
            ORDER BY updated_at DESC LIMIT 1`,
      args: [],
    });

    if (!result.rows[0]) return null;
    return parseResearchSessionRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Update a research session
   */
  async updateSession(sessionId: string, updates: UpdateResearchSessionInput): Promise<void> {
    const db = getDb();
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const args: (string | number | null)[] = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      args.push(updates.status);
    }
    if (updates.phase !== undefined) {
      setClauses.push('phase = ?');
      args.push(updates.phase);
    }
    if (updates.notebookUrl !== undefined) {
      setClauses.push('notebook_url = ?');
      args.push(updates.notebookUrl);
    }
    if (updates.tabId !== undefined) {
      setClauses.push('tab_id = ?');
      args.push(updates.tabId);
    }
    if (updates.error !== undefined) {
      setClauses.push('error = ?');
      args.push(updates.error);
    }

    if (args.length === 0) return;

    args.push(sessionId);
    await db.execute({
      sql: `UPDATE research_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    console.log(`[ResearchRepository] Updated session ${sessionId}:`, updates);
  }

  /**
   * Update session phase
   */
  async updateSessionPhase(sessionId: string, phase: ResearchPhase, error?: string): Promise<void> {
    await this.updateSession(sessionId, {
      phase,
      error: error ?? null,
    });
  }

  /**
   * Set session notebook URL
   */
  async setSessionNotebookUrl(sessionId: string, url: string): Promise<void> {
    await this.updateSession(sessionId, { notebookUrl: url });
  }

  /**
   * Set session tab ID
   */
  async setSessionTabId(sessionId: string, tabId: number): Promise<void> {
    await this.updateSession(sessionId, { tabId });
  }

  /**
   * Close a research session
   */
  async closeSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, {
      status: 'closed',
      phase: 'complete',
    });
    console.log(`[ResearchRepository] Closed session ${sessionId}`);
  }

  /**
   * Pause a research session
   */
  async pauseSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, { status: 'paused' });
    console.log(`[ResearchRepository] Paused session ${sessionId}`);
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, { status: 'active' });
    console.log(`[ResearchRepository] Resumed session ${sessionId}`);
  }

  /**
   * Delete a research session (cascades to sources and questions)
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM research_sessions WHERE id = ?',
      args: [sessionId],
    });
    console.log(`[ResearchRepository] Deleted session ${sessionId}`);
  }

  // ============================================
  // Source Operations
  // ============================================

  /**
   * Add a source to a session
   */
  async addSource(input: CreateResearchSourceInput): Promise<DbResearchSource> {
    const db = getDb();
    const id = generateId('src');
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO research_sources (id, session_id, type, content, description, status, added_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      args: [id, input.sessionId, input.type, input.content, input.description || null, now],
    });

    // Update session's updated_at
    await db.execute({
      sql: 'UPDATE research_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [input.sessionId],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM research_sources WHERE id = ?',
      args: [id],
    });

    if (!result.rows[0]) {
      throw new Error('Failed to add source');
    }

    console.log(`[ResearchRepository] Added source ${id} to session ${input.sessionId}`);
    return parseResearchSourceRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Get all sources for a session
   */
  async getSessionSources(sessionId: string): Promise<DbResearchSource[]> {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM research_sources WHERE session_id = ? ORDER BY added_at ASC',
      args: [sessionId],
    });

    return result.rows.map(row => parseResearchSourceRow(row as Record<string, unknown>));
  }

  /**
   * Update source status
   */
  async updateSourceStatus(sourceId: string, status: ResearchSourceStatus): Promise<void> {
    const db = getDb();
    await db.execute({
      sql: 'UPDATE research_sources SET status = ? WHERE id = ?',
      args: [status, sourceId],
    });
    console.log(`[ResearchRepository] Updated source ${sourceId} status to ${status}`);
  }

  /**
   * Delete a source
   */
  async deleteSource(sourceId: string): Promise<void> {
    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM research_sources WHERE id = ?',
      args: [sourceId],
    });
  }

  // ============================================
  // Question Operations
  // ============================================

  /**
   * Record a question asked during a session
   */
  async recordQuestion(input: CreateResearchQuestionInput): Promise<DbResearchQuestion> {
    const db = getDb();
    const id = generateId('q');
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO research_questions (id, session_id, question, asked_at)
            VALUES (?, ?, ?, ?)`,
      args: [id, input.sessionId, input.question, now],
    });

    // Update session's updated_at
    await db.execute({
      sql: 'UPDATE research_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [input.sessionId],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM research_questions WHERE id = ?',
      args: [id],
    });

    if (!result.rows[0]) {
      throw new Error('Failed to record question');
    }

    console.log(`[ResearchRepository] Recorded question ${id} for session ${input.sessionId}`);
    return parseResearchQuestionRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Get all questions for a session
   */
  async getSessionQuestions(sessionId: string): Promise<DbResearchQuestion[]> {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM research_questions WHERE session_id = ? ORDER BY asked_at ASC',
      args: [sessionId],
    });

    return result.rows.map(row => parseResearchQuestionRow(row as Record<string, unknown>));
  }

  /**
   * Record an answer to a question
   */
  async recordAnswer(questionId: string, answer: string): Promise<void> {
    const db = getDb();
    await db.execute({
      sql: `UPDATE research_questions
            SET answer = ?, answered_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [answer, questionId],
    });
    console.log(`[ResearchRepository] Recorded answer for question ${questionId}`);
  }

  /**
   * Delete a question
   */
  async deleteQuestion(questionId: string): Promise<void> {
    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM research_questions WHERE id = ?',
      args: [questionId],
    });
  }

  // ============================================
  // Utility Operations
  // ============================================

  /**
   * Get session statistics for a user
   */
  async getUserSessionStats(userId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalSources: number;
    totalQuestions: number;
  }> {
    const db = getDb();

    const sessionStats = await db.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
            FROM research_sessions WHERE user_id = ?`,
      args: [userId],
    });

    const sourceCount = await db.execute({
      sql: `SELECT COUNT(*) as count
            FROM research_sources s
            JOIN research_sessions rs ON s.session_id = rs.id
            WHERE rs.user_id = ?`,
      args: [userId],
    });

    const questionCount = await db.execute({
      sql: `SELECT COUNT(*) as count
            FROM research_questions q
            JOIN research_sessions rs ON q.session_id = rs.id
            WHERE rs.user_id = ?`,
      args: [userId],
    });

    return {
      totalSessions: (sessionStats.rows[0]?.total as number) || 0,
      activeSessions: (sessionStats.rows[0]?.active as number) || 0,
      totalSources: (sourceCount.rows[0]?.count as number) || 0,
      totalQuestions: (questionCount.rows[0]?.count as number) || 0,
    };
  }

  /**
   * Clean up old closed sessions (older than specified days)
   */
  async cleanupOldSessions(maxAgeDays: number = 30): Promise<number> {
    const db = getDb();
    const result = await db.execute({
      sql: `DELETE FROM research_sessions
            WHERE status = 'closed'
            AND datetime(updated_at) < datetime('now', '-' || ? || ' days')`,
      args: [maxAgeDays],
    });
    return result.rowsAffected;
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT 1 FROM research_sessions WHERE id = ? LIMIT 1',
      args: [sessionId],
    });
    return result.rows.length > 0;
  }
}

// Export a singleton instance
export const researchRepository = new ResearchRepository();

// Also export the class for testing
export default ResearchRepository;
