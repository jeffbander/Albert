/**
 * Research Session Store
 * Manages NotebookLM research sessions with database persistence and EventEmitter for real-time updates.
 * Pattern follows selfImprovementStore.ts and buildOrchestrator.ts
 *
 * Architecture:
 * - Database (Turso/LibSQL): Persistent storage for sessions, sources, questions
 * - In-memory cache: Fast access for active sessions
 * - EventEmitter: Real-time progress updates for SSE streaming
 */

import { EventEmitter } from 'events';
import { researchRepository } from '@/lib/db/research-repository';
import type {
  ResearchSession,
  ResearchSource,
  ResearchQuestion,
  ResearchPhase,
  ResearchProgressEvent,
  ResearchSessionStatus,
} from '@/types/research';

// Event emitter for real-time progress updates (used by SSE endpoints)
const researchEvents = new EventEmitter();
researchEvents.setMaxListeners(100);

// In-memory cache for active sessions (synced with database)
const activeSessionsCache = new Map<string, ResearchSession>();

// Track the current active session ID for voice interface (only one at a time)
let currentSessionId: string | null = null;

// Default user ID for voice interface (when no auth is configured)
const DEFAULT_USER_ID = 'default-voice-user';

// ============================================
// Session Creation & Retrieval
// ============================================

/**
 * Create a new research session
 * Persists to database and caches in memory
 */
export async function createResearchSession(
  topic: string,
  userId: string = DEFAULT_USER_ID
): Promise<string> {
  // Create in database
  const dbSession = await researchRepository.createSession(userId, topic);

  // Build full session object
  const session: ResearchSession = {
    id: dbSession.id,
    userId: dbSession.userId,
    topic: dbSession.topic,
    status: dbSession.status,
    phase: dbSession.phase,
    notebookUrl: dbSession.notebookUrl || undefined,
    tabId: dbSession.tabId || undefined,
    sources: [],
    questions: [],
    createdAt: dbSession.createdAt,
    updatedAt: dbSession.updatedAt,
    error: dbSession.error || undefined,
  };

  // Cache in memory
  activeSessionsCache.set(session.id, session);
  currentSessionId = session.id;

  console.log(`[ResearchSessionStore] Created session ${session.id} for topic: ${topic}`);

  return session.id;
}

/**
 * Get a research session by ID (checks cache first, then database)
 */
export async function getResearchSession(sessionId: string): Promise<ResearchSession | undefined> {
  // Check cache first
  const cached = activeSessionsCache.get(sessionId);
  if (cached) return cached;

  // Load from database
  const dbSession = await researchRepository.getSessionWithRelations(sessionId);
  if (!dbSession) return undefined;

  // Convert to ResearchSession format
  const session: ResearchSession = {
    id: dbSession.id,
    userId: dbSession.userId,
    topic: dbSession.topic,
    status: dbSession.status,
    phase: dbSession.phase,
    notebookUrl: dbSession.notebookUrl || undefined,
    tabId: dbSession.tabId || undefined,
    sources: dbSession.sources.map(s => ({
      id: s.id,
      type: s.type,
      content: s.content,
      description: s.description || undefined,
      addedAt: s.addedAt,
      status: s.status,
    })),
    questions: dbSession.questions.map(q => ({
      id: q.id,
      question: q.question,
      answer: q.answer || undefined,
      askedAt: q.askedAt,
      answeredAt: q.answeredAt || undefined,
    })),
    createdAt: dbSession.createdAt,
    updatedAt: dbSession.updatedAt,
    error: dbSession.error || undefined,
  };

  // Cache if active
  if (session.status === 'active') {
    activeSessionsCache.set(session.id, session);
  }

  return session;
}

/**
 * Get the current active research session for voice interface
 */
export async function getActiveResearchSession(): Promise<ResearchSession | null> {
  // Check current session ID first
  if (currentSessionId) {
    const session = await getResearchSession(currentSessionId);
    if (session && session.status === 'active') {
      return session;
    }
    // Current session is no longer active
    currentSessionId = null;
  }

  // Try to find any active session from database
  const dbSession = await researchRepository.getAnyActiveSession();
  if (dbSession) {
    const session = await getResearchSession(dbSession.id);
    if (session) {
      currentSessionId = session.id;
      return session;
    }
  }

  return null;
}

/**
 * Get all sessions for a user
 */
export async function getUserResearchSessions(
  userId: string = DEFAULT_USER_ID
): Promise<ResearchSession[]> {
  const dbSessions = await researchRepository.getUserSessions(userId);

  return Promise.all(
    dbSessions.map(async (dbSession) => {
      const fullSession = await getResearchSession(dbSession.id);
      return fullSession!;
    })
  );
}

// ============================================
// Session Updates
// ============================================

/**
 * Update session's Chrome tab ID
 */
export async function setSessionTabId(sessionId: string, tabId: number): Promise<void> {
  await researchRepository.setSessionTabId(sessionId, tabId);

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    cached.tabId = tabId;
    cached.updatedAt = new Date();
  }
}

/**
 * Update session's notebook URL
 */
export async function setSessionNotebookUrl(sessionId: string, url: string): Promise<void> {
  await researchRepository.setSessionNotebookUrl(sessionId, url);

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    cached.notebookUrl = url;
    cached.updatedAt = new Date();
  }
}

/**
 * Update session phase and emit progress event
 */
export async function updateSessionPhase(
  sessionId: string,
  phase: ResearchPhase,
  message?: string,
  answer?: string
): Promise<void> {
  const errorMsg = phase === 'error' ? message : undefined;
  await researchRepository.updateSessionPhase(sessionId, phase, errorMsg);

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    cached.phase = phase;
    cached.updatedAt = new Date();
    if (errorMsg) {
      cached.error = errorMsg;
    }
  }

  // Emit progress event for SSE
  emitResearchProgress(sessionId, phase, message || getDefaultPhaseMessage(phase), answer);
}

// ============================================
// Source Management
// ============================================

/**
 * Add a source to the session
 */
export async function addSourceToSession(
  sessionId: string,
  source: Omit<ResearchSource, 'id' | 'addedAt' | 'status'>
): Promise<string> {
  const dbSource = await researchRepository.addSource({
    sessionId,
    type: source.type,
    content: source.content,
    description: source.description,
  });

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    cached.sources.push({
      id: dbSource.id,
      type: dbSource.type,
      content: dbSource.content,
      description: dbSource.description || undefined,
      addedAt: dbSource.addedAt,
      status: dbSource.status,
    });
    cached.updatedAt = new Date();
  }

  return dbSource.id;
}

/**
 * Update source status
 */
export async function updateSourceStatus(
  sessionId: string,
  sourceId: string,
  status: ResearchSource['status']
): Promise<void> {
  await researchRepository.updateSourceStatus(sourceId, status);

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    const source = cached.sources.find(s => s.id === sourceId);
    if (source) {
      source.status = status;
      cached.updatedAt = new Date();
    }
  }
}

// ============================================
// Question Management
// ============================================

/**
 * Record a question asked to NotebookLM
 */
export async function recordQuestion(sessionId: string, question: string): Promise<string> {
  const dbQuestion = await researchRepository.recordQuestion({
    sessionId,
    question,
  });

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    cached.questions.push({
      id: dbQuestion.id,
      question: dbQuestion.question,
      askedAt: dbQuestion.askedAt,
    });
    cached.updatedAt = new Date();
  }

  return dbQuestion.id;
}

/**
 * Record an answer to a question
 */
export async function recordAnswer(
  sessionId: string,
  questionId: string,
  answer: string
): Promise<void> {
  await researchRepository.recordAnswer(questionId, answer);

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    const question = cached.questions.find(q => q.id === questionId);
    if (question) {
      question.answer = answer;
      question.answeredAt = new Date();
      cached.updatedAt = new Date();
    }
  }
}

// ============================================
// Session Lifecycle
// ============================================

/**
 * Close a research session
 */
export async function closeResearchSession(sessionId: string): Promise<void> {
  await researchRepository.closeSession(sessionId);

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    cached.status = 'closed';
    cached.phase = 'complete';
    cached.updatedAt = new Date();
  }

  // Emit completion event
  emitResearchProgress(
    sessionId,
    'complete',
    'Research session closed. Your notebook is saved in NotebookLM.'
  );

  // Clear current session if this was it
  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }

  // Remove from cache after a delay
  setTimeout(() => {
    activeSessionsCache.delete(sessionId);
    console.log(`[ResearchSessionStore] Removed session ${sessionId} from cache`);
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Pause a research session (keeps it in database but marks as paused)
 */
export async function pauseResearchSession(sessionId: string): Promise<void> {
  await researchRepository.pauseSession(sessionId);

  // Update cache
  const cached = activeSessionsCache.get(sessionId);
  if (cached) {
    cached.status = 'paused';
    cached.updatedAt = new Date();
  }

  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }
}

/**
 * Resume a paused research session
 */
export async function resumeResearchSession(sessionId: string): Promise<void> {
  await researchRepository.resumeSession(sessionId);

  // Reload from database to ensure we have latest data
  const session = await getResearchSession(sessionId);
  if (session) {
    session.status = 'active';
    activeSessionsCache.set(sessionId, session);
    currentSessionId = sessionId;
  }
}

/**
 * Delete a research session permanently
 */
export async function deleteResearchSession(sessionId: string): Promise<void> {
  await researchRepository.deleteSession(sessionId);
  activeSessionsCache.delete(sessionId);

  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }
}

// ============================================
// Event System (for SSE streaming)
// ============================================

/**
 * Subscribe to research progress events
 */
export function subscribeToResearchProgress(
  sessionId: string,
  callback: (event: ResearchProgressEvent) => void
): () => void {
  const eventName = `progress:${sessionId}`;
  researchEvents.on(eventName, callback);

  return () => {
    researchEvents.off(eventName, callback);
  };
}

/**
 * Emit a research progress event
 */
export function emitResearchProgress(
  sessionId: string,
  phase: ResearchPhase,
  message: string,
  answer?: string
): void {
  const event: ResearchProgressEvent = {
    sessionId,
    phase,
    message,
    timestamp: new Date().toISOString(),
    answer,
  };

  researchEvents.emit(`progress:${sessionId}`, event);
  console.log(`[ResearchSessionStore] Progress: ${phase} - ${message.slice(0, 100)}`);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get all active session IDs (from cache)
 */
export function getAllActiveSessionIds(): string[] {
  return Array.from(activeSessionsCache.keys());
}

/**
 * Check if there's an active research session
 */
export function hasActiveSession(): boolean {
  return currentSessionId !== null;
}

/**
 * Get session statistics for a user
 */
export async function getSessionStats(userId: string = DEFAULT_USER_ID) {
  return researchRepository.getUserSessionStats(userId);
}

/**
 * Initialize the store by loading any active sessions from database
 */
export async function initResearchSessionStore(): Promise<void> {
  console.log('[ResearchSessionStore] Initializing from database...');

  // Load any active sessions into cache
  const activeSession = await researchRepository.getAnyActiveSession();
  if (activeSession) {
    const session = await getResearchSession(activeSession.id);
    if (session) {
      currentSessionId = session.id;
      console.log(`[ResearchSessionStore] Restored active session: ${session.id} - ${session.topic}`);
    }
  }

  console.log('[ResearchSessionStore] Initialization complete');
}

/**
 * Get default message for a phase
 */
function getDefaultPhaseMessage(phase: ResearchPhase): string {
  switch (phase) {
    case 'initializing':
      return 'Setting up research session...';
    case 'creating_notebook':
      return 'Creating NotebookLM notebook...';
    case 'adding_sources':
      return 'Adding sources to the notebook...';
    case 'processing':
      return 'NotebookLM is processing the sources...';
    case 'ready':
      return 'Research notebook is ready. You can ask questions or add more sources.';
    case 'querying':
      return 'Asking NotebookLM...';
    case 'complete':
      return 'Research session complete.';
    case 'error':
      return 'An error occurred during research.';
    default:
      return 'Research in progress...';
  }
}

// ============================================
// Legacy Synchronous Compatibility Layer
// (For existing code that expects sync functions)
// ============================================

/**
 * @deprecated Use async createResearchSession instead
 * Synchronous wrapper - creates session but returns ID before DB write completes
 */
export function createResearchSessionSync(topic: string, userId: string = DEFAULT_USER_ID): string {
  const sessionId = `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session: ResearchSession = {
    id: sessionId,
    userId,
    topic,
    status: 'active',
    phase: 'initializing',
    sources: [],
    questions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Cache immediately
  activeSessionsCache.set(sessionId, session);
  currentSessionId = sessionId;

  // Persist to database asynchronously
  researchRepository.createSession(userId, topic).then(dbSession => {
    // Update the cached session with the actual DB ID if different
    if (dbSession.id !== sessionId) {
      activeSessionsCache.delete(sessionId);
      session.id = dbSession.id;
      activeSessionsCache.set(dbSession.id, session);
      if (currentSessionId === sessionId) {
        currentSessionId = dbSession.id;
      }
    }
  }).catch(err => {
    console.error('[ResearchSessionStore] Failed to persist session:', err);
  });

  console.log(`[ResearchSessionStore] Created session ${sessionId} for topic: ${topic}`);
  return sessionId;
}

/**
 * @deprecated Use async getResearchSession instead
 * Get session from cache only (sync)
 */
export function getResearchSessionSync(sessionId: string): ResearchSession | undefined {
  return activeSessionsCache.get(sessionId);
}

/**
 * @deprecated Use async getActiveResearchSession instead
 * Get active session from cache only (sync)
 */
export function getActiveResearchSessionSync(): ResearchSession | null {
  if (!currentSessionId) return null;
  return activeSessionsCache.get(currentSessionId) || null;
}
