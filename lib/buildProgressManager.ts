/**
 * Build Progress Manager
 * Manages real-time build progress updates for the voice interface.
 * Allows Albert to proactively update users about build status.
 */

import type { BuildProgressEvent } from '@/types/build';

export interface BuildProgressCallback {
  onProgress: (event: BuildProgressEvent) => void;
  onComplete: (projectId: string, success: boolean, message: string) => void;
  onError: (projectId: string, error: string) => void;
}

// Track active build subscriptions
const activeSubscriptions = new Map<string, EventSource>();
const callbacks = new Map<string, BuildProgressCallback>();

/**
 * Subscribe to build progress for voice updates
 */
export function subscribeToBuild(
  projectId: string,
  callback: BuildProgressCallback
): () => void {
  // Close existing subscription if any
  const existing = activeSubscriptions.get(projectId);
  if (existing) {
    existing.close();
  }

  // Create new EventSource connection
  const eventSource = new EventSource(`/api/build/${projectId}/stream`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // Skip connection messages
      if (data.type === 'connected') return;

      const progressEvent = data as BuildProgressEvent;

      // Call progress callback
      callback.onProgress(progressEvent);

      // Check for completion or failure
      if (progressEvent.phase === 'complete') {
        callback.onComplete(
          projectId,
          true,
          progressEvent.message || 'Build completed successfully!'
        );
        // Auto-cleanup on completion
        unsubscribeFromBuild(projectId);
      } else if (progressEvent.phase === 'failed') {
        callback.onError(
          projectId,
          progressEvent.message || 'Build failed'
        );
        unsubscribeFromBuild(projectId);
      }
    } catch (e) {
      console.error('[BuildProgressManager] Parse error:', e);
    }
  };

  eventSource.onerror = () => {
    console.error('[BuildProgressManager] SSE error for', projectId);
    eventSource.close();
    activeSubscriptions.delete(projectId);
  };

  activeSubscriptions.set(projectId, eventSource);
  callbacks.set(projectId, callback);

  // Return unsubscribe function
  return () => unsubscribeFromBuild(projectId);
}

/**
 * Unsubscribe from build progress
 */
export function unsubscribeFromBuild(projectId: string): void {
  const eventSource = activeSubscriptions.get(projectId);
  if (eventSource) {
    eventSource.close();
    activeSubscriptions.delete(projectId);
  }
  callbacks.delete(projectId);
}

/**
 * Unsubscribe from all builds
 */
export function unsubscribeAll(): void {
  activeSubscriptions.forEach((es) => es.close());
  activeSubscriptions.clear();
  callbacks.clear();
}

/**
 * Get list of active build subscriptions
 */
export function getActiveBuilds(): string[] {
  return Array.from(activeSubscriptions.keys());
}

/**
 * Format progress event for voice output
 */
export function formatProgressForVoice(event: BuildProgressEvent): string {
  switch (event.phase) {
    case 'planning':
      return "I'm analyzing the requirements and planning the project structure.";
    case 'building':
      if (event.progress && event.progress > 50) {
        return "The build is progressing well. I'm writing the code and setting things up.";
      }
      return "I've started building the project. This may take a few minutes.";
    case 'testing':
      return "The code is written. Now I'm testing to make sure everything works.";
    case 'deploying':
      return "Tests passed! I'm starting up the development server.";
    case 'complete':
      return event.message || "The build is complete! Your project is ready.";
    case 'failed':
      return `Unfortunately, the build failed: ${event.message || 'Unknown error'}`;
    default:
      return event.message || "Build is in progress...";
  }
}

/**
 * Determine if this progress event warrants a voice update
 * (Avoid spamming the user with every small update)
 */
export function shouldNotifyVoice(event: BuildProgressEvent, lastNotifiedPhase?: string): boolean {
  // Always notify on phase changes
  if (event.phase !== lastNotifiedPhase) {
    return true;
  }

  // Notify on completion or failure
  if (event.phase === 'complete' || event.phase === 'failed') {
    return true;
  }

  // Notify at significant progress milestones (25%, 50%, 75%)
  if (event.progress) {
    const milestones = [25, 50, 75];
    return milestones.some(m =>
      event.progress! >= m && event.progress! < m + 5
    );
  }

  return false;
}
