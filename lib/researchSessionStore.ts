/**
 * Research Session Store
 * Manages active NotebookLM research sessions with EventEmitter for progress updates.
 * Pattern follows selfImprovementStore.ts and buildOrchestrator.ts
 */

import { EventEmitter } from 'events';
import type {
  ResearchSession,
  ResearchSource,
  ResearchQuestion,
  ResearchPhase,
  ResearchProgressEvent,
} from '@/types/research';

// Event emitter for real-time progress updates
const researchEvents = new EventEmitter();
researchEvents.setMaxListeners(100);

// In-memory store for active research sessions
const activeSessions = new Map<string, ResearchSession>();

// Track the current active session (only one at a time for voice interface)
let currentSessionId: string | null = null;

/**
 * Create a new research session
 */
export function createResearchSession(topic: string): string {
  const sessionId = `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session: ResearchSession = {
    id: sessionId,
    topic,
    phase: 'initializing',
    sources: [],
    questions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  activeSessions.set(sessionId, session);
  currentSessionId = sessionId;

  console.log(`[ResearchSessionStore] Created session ${sessionId} for topic: ${topic}`);

  return sessionId;
}

/**
 * Get a research session by ID
 */
export function getResearchSession(sessionId: string): ResearchSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Get the current active research session
 */
export function getActiveResearchSession(): ResearchSession | null {
  if (!currentSessionId) return null;
  return activeSessions.get(currentSessionId) || null;
}

/**
 * Update the session's Chrome tab ID
 */
export function setSessionTabId(sessionId: string, tabId: number): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.tabId = tabId;
    session.updatedAt = new Date();
  }
}

/**
 * Update the session's notebook URL
 */
export function setSessionNotebookUrl(sessionId: string, url: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.notebookUrl = url;
    session.updatedAt = new Date();
  }
}

/**
 * Update session phase and emit progress event
 */
export function updateSessionPhase(
  sessionId: string,
  phase: ResearchPhase,
  message?: string,
  answer?: string
): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn(`[ResearchSessionStore] Session ${sessionId} not found`);
    return;
  }

  session.phase = phase;
  session.updatedAt = new Date();

  if (phase === 'error' && message) {
    session.error = message;
  }

  // Emit progress event
  emitResearchProgress(sessionId, phase, message || getDefaultPhaseMessage(phase), answer);
}

/**
 * Add a source to the session
 */
export function addSourceToSession(
  sessionId: string,
  source: Omit<ResearchSource, 'id' | 'addedAt' | 'status'>
): string {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newSource: ResearchSource = {
    ...source,
    id: sourceId,
    addedAt: new Date(),
    status: 'pending',
  };

  session.sources.push(newSource);
  session.updatedAt = new Date();

  return sourceId;
}

/**
 * Update source status
 */
export function updateSourceStatus(
  sessionId: string,
  sourceId: string,
  status: ResearchSource['status']
): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const source = session.sources.find(s => s.id === sourceId);
  if (source) {
    source.status = status;
    session.updatedAt = new Date();
  }
}

/**
 * Record a question asked to NotebookLM
 */
export function recordQuestion(sessionId: string, question: string): string {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const questionId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newQuestion: ResearchQuestion = {
    id: questionId,
    question,
    askedAt: new Date(),
  };

  session.questions.push(newQuestion);
  session.updatedAt = new Date();

  return questionId;
}

/**
 * Record an answer to a question
 */
export function recordAnswer(sessionId: string, questionId: string, answer: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const question = session.questions.find(q => q.id === questionId);
  if (question) {
    question.answer = answer;
    question.answeredAt = new Date();
    session.updatedAt = new Date();
  }
}

/**
 * Close a research session
 */
export function closeResearchSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.phase = 'complete';
    session.updatedAt = new Date();

    // Emit completion event
    emitResearchProgress(sessionId, 'complete', 'Research session closed. Your notebook is saved in NotebookLM.');
  }

  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }

  // Keep session in memory for a while for reference
  setTimeout(() => {
    activeSessions.delete(sessionId);
    console.log(`[ResearchSessionStore] Cleaned up session ${sessionId}`);
  }, 5 * 60 * 1000); // 5 minutes
}

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

/**
 * Get all active session IDs
 */
export function getAllActiveSessionIds(): string[] {
  return Array.from(activeSessions.keys());
}

/**
 * Check if there's an active research session
 */
export function hasActiveSession(): boolean {
  return currentSessionId !== null && activeSessions.has(currentSessionId);
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
