/**
 * Research Progress Manager
 * Manages real-time research progress updates for the voice interface.
 * Allows Albert to proactively update users about research status.
 * Pattern follows buildProgressManager.ts
 */

import type { ResearchProgressEvent, ResearchProgressCallback, ResearchPhase } from '@/types/research';

// Track active research subscriptions
const activeSubscriptions = new Map<string, EventSource>();
const callbacks = new Map<string, ResearchProgressCallback>();

/**
 * Subscribe to research progress for voice updates
 */
export function subscribeToResearch(
  sessionId: string,
  callback: ResearchProgressCallback
): () => void {
  // Close existing subscription if any
  const existing = activeSubscriptions.get(sessionId);
  if (existing) {
    existing.close();
  }

  // Create new EventSource connection
  const eventSource = new EventSource(`/api/notebooklm/${sessionId}/stream`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // Skip connection messages
      if (data.type === 'connected') return;

      const progressEvent = data as ResearchProgressEvent;

      // Call progress callback
      callback.onProgress(progressEvent);

      // Check for completion or failure
      if (progressEvent.phase === 'complete') {
        callback.onComplete(
          sessionId,
          progressEvent.message || 'Research session complete!'
        );
        // Auto-cleanup on completion
        unsubscribeFromResearch(sessionId);
      } else if (progressEvent.phase === 'error') {
        callback.onError(
          sessionId,
          progressEvent.message || 'Research failed'
        );
        unsubscribeFromResearch(sessionId);
      }
    } catch (e) {
      console.error('[ResearchProgressManager] Parse error:', e);
    }
  };

  eventSource.onerror = () => {
    console.error('[ResearchProgressManager] SSE error for', sessionId);
    eventSource.close();
    activeSubscriptions.delete(sessionId);
  };

  activeSubscriptions.set(sessionId, eventSource);
  callbacks.set(sessionId, callback);

  // Return unsubscribe function
  return () => unsubscribeFromResearch(sessionId);
}

/**
 * Unsubscribe from research progress
 */
export function unsubscribeFromResearch(sessionId: string): void {
  const eventSource = activeSubscriptions.get(sessionId);
  if (eventSource) {
    eventSource.close();
    activeSubscriptions.delete(sessionId);
  }
  callbacks.delete(sessionId);
}

/**
 * Unsubscribe from all research sessions
 */
export function unsubscribeAll(): void {
  activeSubscriptions.forEach((es) => es.close());
  activeSubscriptions.clear();
  callbacks.clear();
}

/**
 * Get list of active research subscriptions
 */
export function getActiveResearchSessions(): string[] {
  return Array.from(activeSubscriptions.keys());
}

/**
 * Format progress event for voice output
 */
export function formatResearchProgressForVoice(event: ResearchProgressEvent): string {
  switch (event.phase) {
    case 'initializing':
      return "I'm setting up your research session.";
    case 'creating_notebook':
      return "Creating your research notebook in NotebookLM.";
    case 'adding_sources':
      return "Adding sources to your research. This may take a moment.";
    case 'processing':
      return "NotebookLM is processing the sources. I'll let you know when it's ready.";
    case 'ready':
      if (event.answer) {
        // This is a response to a question
        return event.answer.slice(0, 500); // Limit voice response length
      }
      return event.message || "Your research is ready. You can ask me questions about it.";
    case 'querying':
      return "Let me check with NotebookLM...";
    case 'complete':
      return event.message || "Research session complete. Your notebook is saved in NotebookLM.";
    case 'error':
      return `I ran into an issue: ${event.message || 'Unknown error'}`;
    default:
      return event.message || "Research is in progress...";
  }
}

/**
 * Determine if this progress event warrants a voice update
 * (Avoid spamming the user with every small update)
 */
export function shouldNotifyVoiceResearch(
  event: ResearchProgressEvent,
  lastNotifiedPhase?: ResearchPhase
): boolean {
  // Always notify on phase changes
  if (event.phase !== lastNotifiedPhase) {
    return true;
  }

  // Always notify on completion or error
  if (event.phase === 'complete' || event.phase === 'error') {
    return true;
  }

  // Notify when we have an answer to a question
  if (event.phase === 'ready' && event.answer) {
    return true;
  }

  // Notify on significant messages (more than 50 chars indicates substantial update)
  if (event.message && event.message.length > 50 && event.phase === 'ready') {
    return true;
  }

  return false;
}

/**
 * Get a brief status message for the current research
 */
export function getResearchStatusMessage(phase: ResearchPhase): string {
  switch (phase) {
    case 'initializing':
      return 'Starting research...';
    case 'creating_notebook':
      return 'Creating notebook...';
    case 'adding_sources':
      return 'Adding sources...';
    case 'processing':
      return 'Processing...';
    case 'ready':
      return 'Ready for questions';
    case 'querying':
      return 'Thinking...';
    case 'complete':
      return 'Complete';
    case 'error':
      return 'Error';
    default:
      return 'In progress...';
  }
}
