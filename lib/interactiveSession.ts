/**
 * Interactive Claude Code Session Manager
 * Enables two-way communication between Albert and Claude Code sessions.
 * Detects when Claude Code asks questions and allows user responses.
 *
 * Since the SDK runs queries to completion, we implement interactivity by:
 * 1. Detecting questions in Claude's output
 * 2. Pausing the build and notifying Albert
 * 3. User responds via voice
 * 4. Resuming with a new query that includes the user's answer
 */

import { EventEmitter } from 'events';

export interface SessionMessage {
  type: 'assistant' | 'clarification_needed' | 'progress' | 'complete' | 'error';
  content: string;
  sessionId: string;
  requiresResponse?: boolean;
  options?: string[]; // For multiple choice clarifications
}

export interface ActiveSession {
  id: string;
  projectId: string;
  status: 'running' | 'waiting_for_input' | 'complete' | 'error';
  pendingQuestion?: string;
  pendingOptions?: string[];
  context: string[]; // Accumulated context for continuation
  createdAt: Date;
}

// Store active sessions
const activeSessions = new Map<string, ActiveSession>();

// Event emitter for session events
export const sessionEvents = new EventEmitter();
sessionEvents.setMaxListeners(50);

// Patterns that indicate Claude Code is asking for clarification
const CLARIFICATION_PATTERNS = [
  /would you (like|prefer|want)/i,
  /should I/i,
  /do you want/i,
  /which (one|option|approach)/i,
  /please (clarify|specify|confirm)/i,
  /can you (tell|explain|clarify)/i,
  /what (would you|should|do you)/i,
  /choose (between|from)/i,
  /prefer (a|the)/i,
  /before I (proceed|continue|start)/i,
];

// Patterns that are NOT clarifications (rhetorical or progress updates)
const NOT_CLARIFICATION_PATTERNS = [
  /let me/i,
  /I('ll| will)/i,
  /now I/i,
  /I'm going to/i,
  /ready to/i,
  /starting/i,
  /creating/i,
  /writing/i,
];

/**
 * Detect if a message is asking for clarification
 */
export function detectsClarificationRequest(message: string): boolean {
  // Must end with question mark or match clarification patterns
  const hasQuestionMark = message.trim().endsWith('?');
  const matchesClarification = CLARIFICATION_PATTERNS.some(pattern => pattern.test(message));

  if (!hasQuestionMark && !matchesClarification) return false;

  // Make sure it's not a rhetorical question
  const isRhetorical = NOT_CLARIFICATION_PATTERNS.some(pattern => pattern.test(message));

  return !isRhetorical;
}

/**
 * Extract options from a clarification message
 */
export function extractOptions(message: string): string[] {
  const options: string[] = [];

  // Look for numbered options (1. option, 2. option)
  const numberedPattern = /(?:^|\n)\s*(\d+)[.)]\s*(.+?)(?=\n\s*\d+[.)]|\n\n|$)/g;
  let match;
  while ((match = numberedPattern.exec(message)) !== null) {
    options.push(match[2].trim());
  }

  // Look for bullet options (- option, * option)
  if (options.length === 0) {
    const bulletPattern = /(?:^|\n)\s*[-*]\s*(.+?)(?=\n\s*[-*]|\n\n|$)/g;
    while ((match = bulletPattern.exec(message)) !== null) {
      options.push(match[1].trim());
    }
  }

  // Look for "A or B" patterns
  if (options.length === 0) {
    const orPattern = /(?:between|choose|prefer)\s+(.+?)\s+or\s+(.+?)(?:\?|\.|\n|$)/i;
    const orMatch = message.match(orPattern);
    if (orMatch) {
      options.push(orMatch[1].trim(), orMatch[2].trim());
    }
  }

  return options;
}

/**
 * Create a new session for a project
 */
export function createSession(projectId: string): string {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session: ActiveSession = {
    id: sessionId,
    projectId,
    status: 'running',
    context: [],
    createdAt: new Date(),
  };

  activeSessions.set(sessionId, session);
  return sessionId;
}

/**
 * Mark session as waiting for input
 */
export function setSessionWaiting(
  sessionId: string,
  question: string,
  options?: string[]
): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = 'waiting_for_input';
    session.pendingQuestion = question;
    session.pendingOptions = options;

    // Emit event for voice interface
    sessionEvents.emit(`clarification:${session.projectId}`, {
      sessionId,
      question,
      options,
    });
  }
}

/**
 * Process a message from Claude and check for clarifications
 */
export function processMessage(
  sessionId: string,
  message: string,
  onClarification?: (question: string, options?: string[]) => void
): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  // Add to context
  session.context.push(message);

  // Check for clarification request
  if (detectsClarificationRequest(message)) {
    const options = extractOptions(message);
    setSessionWaiting(sessionId, message, options.length > 0 ? options : undefined);
    onClarification?.(message, options.length > 0 ? options : undefined);
    return true; // Indicates clarification needed
  }

  return false; // No clarification needed
}

/**
 * Add user response to session context
 */
export function addUserResponse(sessionId: string, response: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'waiting_for_input') {
    return false;
  }

  session.context.push(`User response: ${response}`);
  session.status = 'running';
  session.pendingQuestion = undefined;
  session.pendingOptions = undefined;

  return true;
}

/**
 * Get the continuation prompt with user's response
 */
export function getContinuationPrompt(sessionId: string, userResponse: string): string {
  const session = activeSessions.get(sessionId);
  if (!session) return '';

  return `The user has provided the following response to your question:

"${userResponse}"

Please continue with the build using this information.`;
}

/**
 * Mark session as complete
 */
export function completeSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = 'complete';
  }
}

/**
 * Mark session as error
 */
export function errorSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = 'error';
  }
}

/**
 * Get session by project ID
 */
export function getSessionByProjectId(projectId: string): ActiveSession | undefined {
  for (const session of activeSessions.values()) {
    if (session.projectId === projectId) {
      return session;
    }
  }
  return undefined;
}

/**
 * Get session status
 */
export function getSessionStatus(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Get all active sessions
 */
export function getAllActiveSessions(): ActiveSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Subscribe to clarification requests for a project
 */
export function onClarificationRequest(
  projectId: string,
  callback: (data: { sessionId: string; question: string; options?: string[] }) => void
): () => void {
  const eventName = `clarification:${projectId}`;
  sessionEvents.on(eventName, callback);
  return () => sessionEvents.off(eventName, callback);
}

/**
 * Emit a clarification request manually (for testing or external triggers)
 */
export function emitClarificationRequest(
  projectId: string,
  question: string,
  options?: string[]
): void {
  const session = getSessionByProjectId(projectId);
  sessionEvents.emit(`clarification:${projectId}`, {
    sessionId: session?.id || 'unknown',
    question,
    options,
  });
}

/**
 * Clean up old sessions
 */
export function cleanupOldSessions(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    if (now - session.createdAt.getTime() > maxAgeMs) {
      if (session.status === 'complete' || session.status === 'error') {
        activeSessions.delete(id);
      }
    }
  }
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}
