/**
 * Store for active self-improvement sessions
 * Hybrid approach: fast in-memory access with DB persistence
 * Data survives server restarts
 */

import type { BuildActivity } from './buildActivityParser';
import {
  createActiveImprovement,
  getActiveImprovementFromDb,
  updateActiveImprovement,
  deleteActiveImprovement as deleteFromDb,
  getAllActiveImprovementIdsFromDb,
  getRunningImprovements,
} from './db';

export interface ActiveImprovement {
  activities: BuildActivity[];
  messages: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

// In-memory cache for fast access
const memoryCache = new Map<string, ActiveImprovement>();

// Flag to track if we've loaded from DB
let cacheInitialized = false;

/**
 * Initialize the cache from DB on first access
 */
async function ensureCacheInitialized(): Promise<void> {
  if (cacheInitialized) return;

  try {
    // Load all running/pending improvements from DB
    const running = await getRunningImprovements();
    for (const record of running) {
      memoryCache.set(record.id, {
        activities: JSON.parse(record.activities),
        messages: JSON.parse(record.messages),
        status: record.status,
      });
    }
    cacheInitialized = true;
  } catch (error) {
    console.error('[SelfImprovementStore] Failed to initialize from DB:', error);
    cacheInitialized = true; // Mark as initialized to avoid infinite retries
  }
}

/**
 * Get an active improvement by ID
 */
export function getActiveImprovement(logId: string): ActiveImprovement | undefined {
  // Trigger cache init asynchronously (won't block)
  ensureCacheInitialized().catch(() => {});

  // Return from memory cache
  return memoryCache.get(logId);
}

/**
 * Get an active improvement by ID (async version that ensures DB is checked)
 */
export async function getActiveImprovementAsync(logId: string): Promise<ActiveImprovement | undefined> {
  await ensureCacheInitialized();

  // First check memory cache
  const cached = memoryCache.get(logId);
  if (cached) return cached;

  // Fall back to DB if not in cache
  try {
    const record = await getActiveImprovementFromDb(logId);
    if (record) {
      const improvement: ActiveImprovement = {
        activities: JSON.parse(record.activities),
        messages: JSON.parse(record.messages),
        status: record.status,
      };
      memoryCache.set(logId, improvement);
      return improvement;
    }
  } catch (error) {
    console.error('[SelfImprovementStore] Failed to get from DB:', error);
  }

  return undefined;
}

/**
 * Create or update an active improvement
 * Persists to DB immediately
 */
export function setActiveImprovement(logId: string, improvement: ActiveImprovement): void {
  // Update memory cache immediately
  memoryCache.set(logId, improvement);

  // Persist to DB asynchronously
  persistToDb(logId, improvement).catch((error) => {
    console.error('[SelfImprovementStore] Failed to persist:', error);
  });
}

/**
 * Update specific fields of an active improvement
 */
export function updateActiveImprovementStatus(
  logId: string,
  updates: Partial<ActiveImprovement>
): void {
  const existing = memoryCache.get(logId);
  if (!existing) return;

  const updated: ActiveImprovement = {
    ...existing,
    ...updates,
  };

  memoryCache.set(logId, updated);

  // Persist to DB asynchronously
  persistToDb(logId, updated).catch((error) => {
    console.error('[SelfImprovementStore] Failed to persist update:', error);
  });
}

/**
 * Delete an active improvement
 */
export function deleteActiveImprovement(logId: string): boolean {
  const existed = memoryCache.delete(logId);

  // Delete from DB asynchronously
  deleteFromDb(logId).catch((error) => {
    console.error('[SelfImprovementStore] Failed to delete from DB:', error);
  });

  return existed;
}

/**
 * Get all active improvement IDs
 */
export function getAllActiveImprovementIds(): string[] {
  // Trigger cache init asynchronously
  ensureCacheInitialized().catch(() => {});

  return Array.from(memoryCache.keys());
}

/**
 * Get all active improvement IDs (async version)
 */
export async function getAllActiveImprovementIdsAsync(): Promise<string[]> {
  await ensureCacheInitialized();

  // Also check DB for any we might have missed
  try {
    const dbIds = await getAllActiveImprovementIdsFromDb();
    // Load any missing from DB
    for (const id of dbIds) {
      if (!memoryCache.has(id)) {
        const record = await getActiveImprovementFromDb(id);
        if (record) {
          memoryCache.set(id, {
            activities: JSON.parse(record.activities),
            messages: JSON.parse(record.messages),
            status: record.status,
          });
        }
      }
    }
  } catch (error) {
    console.error('[SelfImprovementStore] Failed to get IDs from DB:', error);
  }

  return Array.from(memoryCache.keys());
}

/**
 * Get count of currently running improvements
 */
export function getRunningCount(): number {
  let count = 0;
  for (const improvement of memoryCache.values()) {
    if (improvement.status === 'running') {
      count++;
    }
  }
  return count;
}

/**
 * Persist improvement to database
 */
async function persistToDb(logId: string, improvement: ActiveImprovement): Promise<void> {
  try {
    // Check if record exists
    const existing = await getActiveImprovementFromDb(logId);

    if (existing) {
      // Update existing record
      await updateActiveImprovement(logId, {
        status: improvement.status,
        activities: improvement.activities,
        messages: improvement.messages,
      });
    } else {
      // Create new record
      await createActiveImprovement(logId, improvement.status);
      // Then update with activities and messages
      await updateActiveImprovement(logId, {
        activities: improvement.activities,
        messages: improvement.messages,
      });
    }
  } catch (error) {
    console.error('[SelfImprovementStore] DB persist error:', error);
    throw error;
  }
}
