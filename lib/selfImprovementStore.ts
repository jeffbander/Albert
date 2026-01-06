/**
 * Store for active self-improvement sessions
 * Allows sharing state between the main route and the streaming endpoint
 */

import type { BuildActivity } from './buildActivityParser';

export interface ActiveImprovement {
  activities: BuildActivity[];
  messages: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

// Store active improvement streams (in-memory)
const activeImprovements = new Map<string, ActiveImprovement>();

export function getActiveImprovement(logId: string): ActiveImprovement | undefined {
  return activeImprovements.get(logId);
}

export function setActiveImprovement(logId: string, improvement: ActiveImprovement): void {
  activeImprovements.set(logId, improvement);
}

export function deleteActiveImprovement(logId: string): boolean {
  return activeImprovements.delete(logId);
}

export function getAllActiveImprovementIds(): string[] {
  return Array.from(activeImprovements.keys());
}
