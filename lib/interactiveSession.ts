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
 *
 * ## Enhanced Features (v2.0):
 *
 * ### Advanced Question Detection
 * - 40+ question patterns covering preferences, decisions, confirmations, and uncertainties
 * - Rhetorical question filtering to avoid false positives
 * - Sentence-level analysis for better context understanding
 * - Confidence scoring (0-100%) to prioritize genuine questions
 *
 * ### Intelligent Option Extraction
 * - Supports multiple formats: numbered, lettered, bulleted, inline
 * - Handles "A or B" and comma-separated lists
 * - Smart cleanup of punctuation and quotes
 *
 * ### Response Validation
 * - Validates responses against provided options
 * - Supports exact, partial, and indexed matching (e.g., "1", "option 2", "a")
 * - Allows custom responses even when options are provided
 *
 * ### Session Management
 * - Timeout detection and auto-resume capability
 * - Activity tracking with timestamps
 * - Confidence-based filtering (only blocks on 50%+ confidence)
 * - Session statistics and monitoring
 *
 * ### Usage Example:
 * ```typescript
 * const sessionId = createSession(projectId, { responseTimeout: 300000 });
 *
 * // Process Claude's messages
 * const needsInput = processMessage(sessionId, claudeMessage, (question, options, confidence) => {
 *   console.log(`Question (${confidence}% confidence):`, question);
 *   if (options) console.log('Options:', options);
 * });
 *
 * // Later, when user responds
 * if (addUserResponse(sessionId, userInput)) {
 *   const continuationPrompt = getContinuationPrompt(sessionId, userInput);
 *   // Resume the build with the user's response
 * }
 * ```
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
  confidenceScore?: number; // Confidence that this is a real question (0-100)
  context: string[]; // Accumulated context for continuation
  createdAt: Date;
  waitingSince?: Date; // When did we start waiting for input
  lastActivity?: Date; // Last time there was any activity
  responseTimeout?: number; // Custom timeout in ms for this session
}

// Store active sessions
const activeSessions = new Map<string, ActiveSession>();

// Event emitter for session events
export const sessionEvents = new EventEmitter();
sessionEvents.setMaxListeners(50);

// Patterns that indicate Claude Code is asking for clarification
const CLARIFICATION_PATTERNS = [
  // Preference questions
  /would you (like|prefer|want|need)/i,
  /do you (want|prefer|need|have)/i,
  /which (one|option|approach|method|way|version|framework|library|tool)/i,
  /what (would|should|do) you (like|prefer|want|need)/i,
  /how (would|should) you (like|prefer|want)/i,

  // Decision-making questions
  /should I/i,
  /shall I/i,
  /may I/i,
  /can I (use|create|modify|add|remove|change)/i,

  // Clarification requests
  /please (clarify|specify|confirm|tell|let me know|indicate)/i,
  /can you (tell|explain|clarify|provide|specify|confirm)/i,
  /could you (tell|explain|clarify|provide|specify|confirm)/i,

  // Choice questions
  /choose (between|from|one of)/i,
  /prefer (a|the|to use|using)/i,
  /select (from|between)/i,
  /pick (one|between|from)/i,

  // Confirmation questions
  /is (this|that|it) (okay|ok|correct|right|what you want|acceptable)/i,
  /does (this|that) (work|sound|look) (good|okay|ok|right)/i,
  /are you (okay|ok|fine|happy) with/i,

  // Blocking questions
  /before I (proceed|continue|start|move forward|go ahead)/i,
  /need (your|you to|to know)/i,
  /require (your|you to|clarification)/i,

  // Information gathering
  /what (is|are) (the|your)/i,
  /where (should|do you want|would you like)/i,
  /when (should|do you want|would you like)/i,
  /who (should|will|is)/i,
  /why (do you want|should|would you like)/i,

  // Uncertainty expressions
  /not sure (if|whether|about|how)/i,
  /uncertain (about|if|whether|how)/i,
  /unclear (if|whether|about|what|how)/i,
  /don't know (if|whether|what|how|which)/i,
  /need to know/i,
  /help me understand/i,

  // Multiple options presented
  /option [0-9]+/i,
  /approach [0-9]+/i,
  /\d+\.\s+.+or\s+\d+\.\s+/i, // "1. option or 2. option"
];

// Patterns that are NOT clarifications (rhetorical or progress updates)
const NOT_CLARIFICATION_PATTERNS = [
  // Progress indicators
  /let me/i,
  /I('ll| will) (now|first|next|then|go ahead)/i,
  /now I('ll| will|'m going to| am going to)/i,
  /I'm (going to|about to|starting to|ready to)/i,
  /ready to/i,
  /starting (to|with)/i,
  /creating/i,
  /writing/i,
  /building/i,
  /updating/i,
  /modifying/i,
  /implementing/i,

  // Rhetorical questions
  /what can we do/i,
  /what should we do next/i,
  /how about (that|this)/i,
  /isn't (this|that|it) (great|good|nice)/i,

  // Self-directed statements
  /let's (see|try|start|begin|create|build)/i,
  /I can (see|do|create|make|help)/i,
  /I know (how|what|that)/i,
  /I understand/i,
];

/**
 * Detect if a message is asking for clarification
 * Enhanced with more sophisticated pattern matching and contextual analysis
 */
export function detectsClarificationRequest(message: string): boolean {
  const normalizedMessage = message.trim();

  // Quick exit for empty messages
  if (!normalizedMessage) return false;

  // Check if it's a rhetorical question or progress update first (high priority)
  const isRhetorical = NOT_CLARIFICATION_PATTERNS.some(pattern => pattern.test(normalizedMessage));
  if (isRhetorical) return false;

  // Check for explicit question mark
  const hasQuestionMark = normalizedMessage.endsWith('?');

  // Check if message matches clarification patterns
  const matchesClarification = CLARIFICATION_PATTERNS.some(pattern => pattern.test(normalizedMessage));

  // Enhanced detection: split into sentences and check each one
  const sentences = normalizedMessage.split(/[.!]/);
  const lastSentence = sentences[sentences.length - 1]?.trim() || '';

  // If the last sentence has a question mark or matches patterns, it's likely a question
  const lastSentenceHasQuestion = lastSentence.endsWith('?');
  const lastSentenceMatchesPattern = CLARIFICATION_PATTERNS.some(pattern => pattern.test(lastSentence));

  // Detect implicit questions (statements that imply a need for input)
  const hasUncertaintyExpression = /not sure|uncertain|unclear|don't know|need to know|help me understand/i.test(normalizedMessage);
  const hasOptionsPresented = /option \d+|approach \d+|\d+\.\s+.+\s+or\s+\d+\./i.test(normalizedMessage);

  // Return true if any of these conditions are met:
  // 1. Has question mark AND matches clarification pattern
  // 2. Last sentence is a question with question mark
  // 3. Last sentence matches pattern (implicit question)
  // 4. Has uncertainty expression + question mark
  // 5. Presents options (multiple choices)
  return (
    (hasQuestionMark && matchesClarification) ||
    lastSentenceHasQuestion ||
    (lastSentenceMatchesPattern && lastSentence.length > 10) || // Avoid false positives on short matches
    (hasUncertaintyExpression && hasQuestionMark) ||
    hasOptionsPresented
  );
}

/**
 * Calculate confidence score for a clarification request (0-100)
 * Helps prioritize which messages really need user input
 */
export function getClarificationConfidence(message: string): number {
  let confidence = 0;
  const normalizedMessage = message.trim();

  // Base score for question mark
  if (normalizedMessage.endsWith('?')) confidence += 30;

  // Count matching clarification patterns (max 40 points)
  const matchCount = CLARIFICATION_PATTERNS.filter(pattern => pattern.test(normalizedMessage)).length;
  confidence += Math.min(matchCount * 10, 40);

  // Bonus for explicit uncertainty (10 points)
  if (/not sure|uncertain|unclear|don't know/i.test(normalizedMessage)) confidence += 10;

  // Bonus for multiple options presented (15 points)
  if (/option \d+|approach \d+|\d+\.\s+/i.test(normalizedMessage)) confidence += 15;

  // Penalty for rhetorical indicators (-30 points)
  const rhetoricalMatch = NOT_CLARIFICATION_PATTERNS.filter(pattern => pattern.test(normalizedMessage)).length;
  confidence -= Math.min(rhetoricalMatch * 15, 30);

  // Clamp between 0-100
  return Math.max(0, Math.min(100, confidence));
}

/**
 * Extract options from a clarification message
 * Enhanced to detect more option formats and clean them up
 */
export function extractOptions(message: string): string[] {
  const options: string[] = [];
  let match;

  // Pattern 1: Numbered options (1. option, 2. option, 1) option)
  const numberedPattern = /(?:^|\n)\s*(\d+)[.)]\s*([^\n]+)/g;
  while ((match = numberedPattern.exec(message)) !== null) {
    const optionText = match[2].trim();
    if (optionText.length > 0 && optionText.length < 200) { // Reasonable length
      options.push(optionText);
    }
  }

  // Pattern 2: Lettered options (a. option, b. option, A) option)
  if (options.length === 0) {
    const letteredPattern = /(?:^|\n)\s*([a-z])[.)]\s*([^\n]+)/gi;
    while ((match = letteredPattern.exec(message)) !== null) {
      const optionText = match[2].trim();
      if (optionText.length > 0 && optionText.length < 200) {
        options.push(optionText);
      }
    }
  }

  // Pattern 3: Bullet options (- option, * option, • option)
  if (options.length === 0) {
    const bulletPattern = /(?:^|\n)\s*[-*•]\s*([^\n]+)/g;
    while ((match = bulletPattern.exec(message)) !== null) {
      const optionText = match[1].trim();
      // Only add if it looks like an option (not too long, not empty)
      if (optionText.length > 0 && optionText.length < 200) {
        options.push(optionText);
      }
    }
  }

  // Pattern 4: "A or B" / "A, B, or C" patterns
  if (options.length === 0) {
    // Try "between X and Y" or "choose X or Y"
    const betweenPattern = /(?:between|choose|select|prefer)\s+(.+?)\s+(?:and|or)\s+(.+?)(?:\?|\.|\n|$)/i;
    const betweenMatch = message.match(betweenPattern);
    if (betweenMatch) {
      options.push(betweenMatch[1].trim(), betweenMatch[2].trim());
    }
  }

  // Pattern 5: Comma-separated list with "or" at the end
  if (options.length === 0) {
    const listPattern = /(?:use|choose|select|prefer)\s+(.+?,\s*.+?)\s+or\s+(.+?)(?:\?|\.|\n|$)/i;
    const listMatch = message.match(listPattern);
    if (listMatch) {
      const items = listMatch[1].split(',').map(s => s.trim());
      items.push(listMatch[2].trim());
      options.push(...items.filter(s => s.length > 0 && s.length < 200));
    }
  }

  // Pattern 6: Inline options with "Option X:" format
  if (options.length === 0) {
    const inlinePattern = /Option\s+(\d+|[a-z])\s*:\s*([^\n.]+)/gi;
    while ((match = inlinePattern.exec(message)) !== null) {
      const optionText = match[2].trim();
      if (optionText.length > 0 && optionText.length < 200) {
        options.push(optionText);
      }
    }
  }

  // Clean up options: remove trailing punctuation, quotes, etc.
  return options.map(opt => {
    let cleaned = opt.trim();
    // Remove trailing punctuation (but keep internal punctuation)
    cleaned = cleaned.replace(/[.,;:!?]+$/, '');
    // Remove surrounding quotes
    cleaned = cleaned.replace(/^["']|["']$/g, '');
    return cleaned;
  }).filter(opt => opt.length > 0);
}

/**
 * Create a new session for a project
 */
export function createSession(projectId: string, options?: { responseTimeout?: number }): string {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const now = new Date();
  const session: ActiveSession = {
    id: sessionId,
    projectId,
    status: 'running',
    context: [],
    createdAt: now,
    lastActivity: now,
    responseTimeout: options?.responseTimeout,
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
  options?: string[],
  confidenceScore?: number
): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = 'waiting_for_input';
    session.pendingQuestion = question;
    session.pendingOptions = options;
    session.confidenceScore = confidenceScore;
    session.waitingSince = new Date();
    session.lastActivity = new Date();

    // Emit event for voice interface
    sessionEvents.emit(`clarification:${session.projectId}`, {
      sessionId,
      question,
      options,
      confidenceScore,
    });
  }
}

/**
 * Process a message from Claude and check for clarifications
 * Enhanced with confidence scoring and better context tracking
 */
export function processMessage(
  sessionId: string,
  message: string,
  onClarification?: (question: string, options?: string[], confidenceScore?: number) => void
): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  // Update last activity timestamp
  session.lastActivity = new Date();

  // Add to context
  session.context.push(message);

  // Check for clarification request
  if (detectsClarificationRequest(message)) {
    const options = extractOptions(message);
    const confidenceScore = getClarificationConfidence(message);

    // Only wait for input if confidence is above threshold (50%)
    // Lower confidence questions might be rhetorical or auto-answerable
    if (confidenceScore >= 50) {
      setSessionWaiting(
        sessionId,
        message,
        options.length > 0 ? options : undefined,
        confidenceScore
      );
      onClarification?.(
        message,
        options.length > 0 ? options : undefined,
        confidenceScore
      );
      return true; // Indicates clarification needed
    } else {
      // Log low-confidence question but don't block
      console.log(`[InteractiveSession] Low confidence question (${confidenceScore}%) - not blocking:`, message.slice(0, 100));
    }
  }

  return false; // No clarification needed
}

/**
 * Add user response to session context
 * Enhanced with response validation and context enrichment
 */
export function addUserResponse(sessionId: string, response: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'waiting_for_input') {
    return false;
  }

  // Validate response is not empty
  const trimmedResponse = response.trim();
  if (!trimmedResponse) {
    console.warn('[InteractiveSession] Empty response received, ignoring');
    return false;
  }

  // Add enriched context with the original question for better continuity
  const contextEntry = session.pendingQuestion
    ? `User was asked: "${session.pendingQuestion}"\nUser responded: "${trimmedResponse}"`
    : `User response: ${trimmedResponse}`;

  session.context.push(contextEntry);
  session.status = 'running';
  session.pendingQuestion = undefined;
  session.pendingOptions = undefined;
  session.confidenceScore = undefined;
  session.waitingSince = undefined;
  session.lastActivity = new Date();

  return true;
}

/**
 * Validate if a response is appropriate for the given options
 */
export function validateResponse(response: string, options?: string[]): {
  isValid: boolean;
  matchedOption?: string;
  message?: string;
} {
  const trimmedResponse = response.trim().toLowerCase();

  if (!trimmedResponse) {
    return { isValid: false, message: 'Response cannot be empty' };
  }

  // If no options provided, any non-empty response is valid
  if (!options || options.length === 0) {
    return { isValid: true };
  }

  // Check for exact match (case-insensitive)
  const exactMatch = options.find(opt => opt.toLowerCase() === trimmedResponse);
  if (exactMatch) {
    return { isValid: true, matchedOption: exactMatch };
  }

  // Check for partial match (response contains option or vice versa)
  const partialMatch = options.find(opt => {
    const optLower = opt.toLowerCase();
    return optLower.includes(trimmedResponse) || trimmedResponse.includes(optLower);
  });
  if (partialMatch) {
    return { isValid: true, matchedOption: partialMatch };
  }

  // Check for numbered/lettered selection (e.g., "1", "option 2", "a", "b")
  const numberMatch = trimmedResponse.match(/^(?:option\s+)?([0-9]+|[a-z])$/i);
  if (numberMatch) {
    const index = isNaN(Number(numberMatch[1]))
      ? numberMatch[1].toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0)
      : Number(numberMatch[1]) - 1;

    if (index >= 0 && index < options.length) {
      return { isValid: true, matchedOption: options[index] };
    }
  }

  // Response doesn't match any option, but still allow it (user might have a custom answer)
  return {
    isValid: true,
    message: 'Response does not match any provided option, but will be accepted as custom input',
  };
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
  for (const session of Array.from(activeSessions.values())) {
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
 * Check if a session has timed out waiting for a response
 */
export function isSessionTimedOut(sessionId: string, defaultTimeoutMs: number = 300000): boolean {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'waiting_for_input' || !session.waitingSince) {
    return false;
  }

  const timeoutMs = session.responseTimeout || defaultTimeoutMs;
  const waitTime = Date.now() - session.waitingSince.getTime();
  return waitTime > timeoutMs;
}

/**
 * Get all timed out sessions
 */
export function getTimedOutSessions(defaultTimeoutMs: number = 300000): ActiveSession[] {
  const timedOut: ActiveSession[] = [];
  for (const session of Array.from(activeSessions.values())) {
    if (isSessionTimedOut(session.id, defaultTimeoutMs)) {
      timedOut.push(session);
    }
  }
  return timedOut;
}

/**
 * Auto-resume a timed out session with a default response
 */
export function autoResumeTimedOutSession(
  sessionId: string,
  defaultResponse: string = "Please proceed with your best judgment"
): boolean {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'waiting_for_input') {
    return false;
  }

  console.log(`[InteractiveSession] Auto-resuming timed out session ${sessionId}`);
  session.context.push(`[System: Auto-response after timeout] ${defaultResponse}`);
  session.status = 'running';
  session.pendingQuestion = undefined;
  session.pendingOptions = undefined;
  session.confidenceScore = undefined;
  session.waitingSince = undefined;
  session.lastActivity = new Date();

  return true;
}

/**
 * Clean up old sessions
 * Enhanced to handle timed out sessions
 */
export function cleanupOldSessions(maxAgeMs: number = 3600000, autoResumeTimedOut: boolean = false): void {
  const now = Date.now();

  for (const [id, session] of Array.from(activeSessions.entries())) {
    // Handle timed out sessions
    if (autoResumeTimedOut && isSessionTimedOut(id)) {
      autoResumeTimedOutSession(id);
      continue;
    }

    // Clean up completed/errored sessions
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

/**
 * Update session activity timestamp (for keepalive)
 */
export function updateSessionActivity(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.lastActivity = new Date();
    return true;
  }
  return false;
}

/**
 * Get waiting sessions sorted by confidence score (high to low)
 */
export function getWaitingSessionsByConfidence(): ActiveSession[] {
  return Array.from(activeSessions.values())
    .filter(s => s.status === 'waiting_for_input')
    .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
}

/**
 * Check if project has any active questions waiting
 */
export function hasActiveQuestion(projectId: string): boolean {
  for (const session of Array.from(activeSessions.values())) {
    if (session.projectId === projectId && session.status === 'waiting_for_input') {
      return true;
    }
  }
  return false;
}

/**
 * Get session statistics for monitoring
 */
export function getSessionStats(): {
  total: number;
  running: number;
  waiting: number;
  complete: number;
  error: number;
  timedOut: number;
  avgConfidence: number;
} {
  const sessions = Array.from(activeSessions.values());
  const waitingSessions = sessions.filter(s => s.status === 'waiting_for_input');

  const stats = {
    total: sessions.length,
    running: sessions.filter(s => s.status === 'running').length,
    waiting: waitingSessions.length,
    complete: sessions.filter(s => s.status === 'complete').length,
    error: sessions.filter(s => s.status === 'error').length,
    timedOut: sessions.filter(s => isSessionTimedOut(s.id)).length,
    avgConfidence: 0,
  };

  if (waitingSessions.length > 0) {
    const totalConfidence = waitingSessions.reduce((sum, s) => sum + (s.confidenceScore || 0), 0);
    stats.avgConfidence = totalConfidence / waitingSessions.length;
  }

  return stats;
}

/**
 * Extract the core question from a message (remove preamble and context)
 */
export function extractCoreQuestion(message: string): string {
  const sentences = message.split(/[.!]/);

  // Find sentences that end with ? or match question patterns
  const questions = sentences.filter(s => {
    const trimmed = s.trim();
    return trimmed.endsWith('?') || CLARIFICATION_PATTERNS.some(p => p.test(trimmed));
  });

  if (questions.length > 0) {
    // Return the last question (usually the most important)
    return questions[questions.length - 1].trim() + (questions[questions.length - 1].includes('?') ? '' : '?');
  }

  // Fallback: return last sentence
  return sentences[sentences.length - 1]?.trim() || message;
}
