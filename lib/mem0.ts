import MemoryClient from 'mem0ai';

let mem0Client: MemoryClient | null = null;

// ============================================
// Configuration
// ============================================

const USER_ID = 'echo_user';
const ECHO_SELF_ID = 'echo_self';

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

// ============================================
// Logging & Error Tracking
// ============================================

type LogLevel = 'info' | 'warn' | 'error';

interface FailedOperation {
  id: string;
  operation: 'add' | 'search' | 'getAll';
  userId: string;
  content?: string;
  metadata?: Record<string, unknown>;
  error: string;
  timestamp: Date;
  retryCount: number;
}

// In-memory queue for failed operations (could be persisted to DB later)
const failedOperationsQueue: FailedOperation[] = [];
const MAX_FAILED_QUEUE_SIZE = 100;

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const prefix = `[Mem0][${level.toUpperCase()}][${timestamp}]`;

  const logData = data ? ` ${JSON.stringify(data)}` : '';

  switch (level) {
    case 'info':
      console.log(`${prefix} ${message}${logData}`);
      break;
    case 'warn':
      console.warn(`${prefix} ${message}${logData}`);
      break;
    case 'error':
      console.error(`${prefix} ${message}${logData}`);
      break;
  }
}

function addToFailedQueue(operation: Omit<FailedOperation, 'id' | 'timestamp'>) {
  const failedOp: FailedOperation = {
    ...operation,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };

  failedOperationsQueue.push(failedOp);

  // Keep queue bounded
  if (failedOperationsQueue.length > MAX_FAILED_QUEUE_SIZE) {
    failedOperationsQueue.shift();
  }

  log('warn', 'Operation added to failed queue', {
    operationId: failedOp.id,
    operation: failedOp.operation,
    queueSize: failedOperationsQueue.length
  });
}

// ============================================
// Retry Logic
// ============================================

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  context: { userId: string; content?: string; metadata?: Record<string, unknown> }
): Promise<T | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const result = await operation();

      if (attempt > 0) {
        log('info', `Operation succeeded after ${attempt + 1} attempts`, {
          operation: operationName
        });
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
        RETRY_CONFIG.maxDelayMs
      );

      log('warn', `Operation failed, attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries}`, {
        operation: operationName,
        error: lastError.message,
        nextRetryIn: `${delay}ms`,
      });

      if (attempt < RETRY_CONFIG.maxRetries - 1) {
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  log('error', `Operation failed after ${RETRY_CONFIG.maxRetries} attempts`, {
    operation: operationName,
    error: lastError?.message,
  });

  // Add to failed queue for potential later retry
  addToFailedQueue({
    operation: operationName as 'add' | 'search' | 'getAll',
    userId: context.userId,
    content: context.content,
    metadata: context.metadata,
    error: lastError?.message || 'Unknown error',
    retryCount: RETRY_CONFIG.maxRetries,
  });

  return null;
}

// ============================================
// Client Management
// ============================================

function getMem0Client(): MemoryClient {
  if (!mem0Client) {
    // Trim to remove any trailing newlines/whitespace from Vercel CLI
    const apiKey = process.env.MEM0_API_KEY?.trim();
    if (!apiKey) {
      log('error', 'MEM0_API_KEY not configured');
      throw new Error('MEM0_API_KEY environment variable is not set');
    }
    mem0Client = new MemoryClient({ apiKey });
    log('info', 'Mem0 client initialized');
  }
  return mem0Client;
}

// ============================================
// Type Definitions
// ============================================

export interface Memory {
  id: string;
  memory: string;
  created_at?: string;
  updated_at?: string;
  score?: number; // Relevance score from search
  metadata?: Record<string, unknown>; // Custom metadata attached to the memory
}

export interface MemoryWithImportance extends Memory {
  importance_score?: number;
  retrieval_count?: number;
}

// ============================================
// Memory Categories
// ============================================

export type MemoryCategory =
  | 'user_preferences'      // How user likes things done
  | 'implementation'        // Technical decisions made
  | 'troubleshooting'       // Problems solved and solutions
  | 'component_context'     // Understanding of specific parts
  | 'project_overview'      // High-level project understanding
  | 'task_history'          // Tasks attempted and outcomes
  | 'entity_fact'           // Facts about people/things/places
  | 'conversation_insight'  // Insights from conversations
  | 'workflow_pattern';     // Learned workflows

export interface CategorizedMemoryMetadata extends Record<string, unknown> {
  category: MemoryCategory;
  subcategory?: string;
  confidence?: number;       // 0-1, how confident we are
  source?: string;           // Where this info came from
  related_entities?: string[];
  tags?: string[];
}

export interface TemporalMemoryMetadata extends CategorizedMemoryMetadata {
  t_valid_from?: string;           // ISO timestamp when fact became true
  t_valid_until?: string;          // ISO timestamp when fact stopped being true
  t_ingested: string;              // ISO timestamp when we learned this
  supersedes_memory_id?: string;   // ID of older memory this replaces
  superseded_by?: string;          // ID of memory that replaced this one
  is_current: boolean;             // Whether this is the current known fact
  fact_type?: 'static' | 'dynamic'; // Static facts rarely change, dynamic facts may update
}

// ============================================
// Search Operations
// ============================================

export async function searchMemories(query: string): Promise<Memory[]> {
  log('info', 'Searching user memories', { query: query.substring(0, 50) });

  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.search(query, { user_id: USER_ID });
    },
    'search',
    { userId: USER_ID, content: query }
  );

  const memories = (result as Memory[]) || [];
  log('info', 'Search completed', { resultsCount: memories.length });

  return memories;
}

export async function searchEchoMemories(query: string): Promise<Memory[]> {
  log('info', 'Searching Echo memories', { query: query.substring(0, 50) });

  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.search(query, { user_id: ECHO_SELF_ID });
    },
    'search',
    { userId: ECHO_SELF_ID, content: query }
  );

  const memories = (result as Memory[]) || [];
  log('info', 'Echo search completed', { resultsCount: memories.length });

  return memories;
}

// ============================================
// Add Operations
// ============================================

export async function addMemory(content: string, metadata?: Record<string, unknown>) {
  log('info', 'Adding user memory', {
    contentLength: content.length,
    hasMetadata: !!metadata
  });

  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.add(
        [{ role: 'user', content }],
        { user_id: USER_ID, metadata }
      );
    },
    'add',
    { userId: USER_ID, content, metadata }
  );

  if (result) {
    log('info', 'User memory added successfully');
  }

  return result;
}

export async function addEchoMemory(content: string, metadata?: Record<string, unknown>) {
  log('info', 'Adding Echo memory', {
    contentLength: content.length,
    hasMetadata: !!metadata
  });

  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.add(
        [{ role: 'assistant', content }],
        { user_id: ECHO_SELF_ID, metadata }
      );
    },
    'add',
    { userId: ECHO_SELF_ID, content, metadata }
  );

  if (result) {
    log('info', 'Echo memory added successfully');
  }

  return result;
}

// ============================================
// Retrieval Operations
// ============================================

export async function getRecentMemories(limit: number = 5): Promise<Memory[]> {
  log('info', 'Getting recent user memories', { limit });

  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.getAll({ user_id: USER_ID });
    },
    'getAll',
    { userId: USER_ID }
  );

  if (!result) {
    return [];
  }

  const memories = result as Memory[];
  // Sort by created_at descending (newest first)
  memories.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });

  const sliced = memories.slice(0, limit);
  log('info', 'Recent memories retrieved', {
    totalMemories: memories.length,
    returned: sliced.length
  });

  return sliced;
}

export async function getEchoMemories(limit: number = 50): Promise<Memory[]> {
  log('info', 'Getting Echo memories', { limit });

  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.getAll({ user_id: ECHO_SELF_ID });
    },
    'getAll',
    { userId: ECHO_SELF_ID }
  );

  if (!result) {
    return [];
  }

  const memories = result as Memory[];
  // Sort by created_at descending (newest first)
  memories.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });

  const sliced = memories.slice(0, limit);
  log('info', 'Echo memories retrieved', {
    totalMemories: memories.length,
    returned: sliced.length
  });

  return sliced;
}

// ============================================
// Relevance Scoring
// ============================================

/**
 * Get memories with combined relevance scoring
 * Score = 0.6 * semantic_relevance + 0.25 * recency + 0.15 * importance
 */
export async function getRelevantMemories(
  query: string,
  limit: number = 5
): Promise<MemoryWithImportance[]> {
  log('info', 'Getting relevant memories with scoring', { query: query.substring(0, 50), limit });

  // Get both semantic search results and all memories
  const [searchResults, allMemories] = await Promise.all([
    searchMemories(query),
    withRetry(
      async () => {
        const mem0 = getMem0Client();
        return await mem0.getAll({ user_id: USER_ID });
      },
      'getAll',
      { userId: USER_ID }
    ),
  ]);

  if (!allMemories || allMemories.length === 0) {
    // Fall back to search results only
    return searchResults.slice(0, limit).map(m => ({
      ...m,
      importance_score: 0.5,
      retrieval_count: 0,
    }));
  }

  const memories = allMemories as Memory[];
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  // Create a map of search scores by memory ID
  const searchScoreMap = new Map<string, number>();
  searchResults.forEach((result, index) => {
    // Assign relevance score based on position (higher = more relevant)
    const score = 1 - (index / Math.max(searchResults.length, 1));
    searchScoreMap.set(result.id, score);
  });

  // Score all memories
  const scoredMemories: MemoryWithImportance[] = memories.map(memory => {
    // Semantic relevance (from search position)
    const semanticScore = searchScoreMap.get(memory.id) || 0;

    // Recency score (0-1, higher for more recent)
    const createdAt = memory.created_at ? new Date(memory.created_at).getTime() : 0;
    const age = now - createdAt;
    const recencyScore = Math.max(0, 1 - (age / oneWeekMs));

    // Importance score (placeholder - could be tracked in DB)
    const importanceScore = 0.5;

    // Combined score
    const combinedScore = (0.6 * semanticScore) + (0.25 * recencyScore) + (0.15 * importanceScore);

    return {
      ...memory,
      score: combinedScore,
      importance_score: importanceScore,
      retrieval_count: 0,
    };
  });

  // Sort by combined score and return top results
  scoredMemories.sort((a, b) => (b.score || 0) - (a.score || 0));

  const result = scoredMemories.slice(0, limit);
  log('info', 'Relevant memories scored and retrieved', {
    totalScored: scoredMemories.length,
    returned: result.length,
    topScore: result[0]?.score || 0,
  });

  return result;
}

// ============================================
// Health & Monitoring
// ============================================

export interface Mem0HealthStatus {
  healthy: boolean;
  clientInitialized: boolean;
  failedQueueSize: number;
  lastError?: string;
}

export async function checkMem0Health(): Promise<Mem0HealthStatus> {
  const status: Mem0HealthStatus = {
    healthy: false,
    clientInitialized: !!mem0Client,
    failedQueueSize: failedOperationsQueue.length,
  };

  try {
    const mem0 = getMem0Client();
    // Try a simple operation to verify connectivity
    await mem0.getAll({ user_id: USER_ID });
    status.healthy = true;
    log('info', 'Mem0 health check passed');
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : String(error);
    log('error', 'Mem0 health check failed', { error: status.lastError });
  }

  return status;
}

export function getFailedOperations(): FailedOperation[] {
  return [...failedOperationsQueue];
}

export function clearFailedOperations(): void {
  failedOperationsQueue.length = 0;
  log('info', 'Failed operations queue cleared');
}

/**
 * Retry failed operations from the queue
 * Returns number of successfully retried operations
 */
export async function retryFailedOperations(): Promise<number> {
  if (failedOperationsQueue.length === 0) {
    return 0;
  }

  log('info', 'Retrying failed operations', { queueSize: failedOperationsQueue.length });

  let successCount = 0;
  const operationsToRetry = [...failedOperationsQueue];

  for (const op of operationsToRetry) {
    try {
      if (op.operation === 'add' && op.content) {
        const mem0 = getMem0Client();
        const role = op.userId === ECHO_SELF_ID ? 'assistant' : 'user';
        await mem0.add(
          [{ role, content: op.content }],
          { user_id: op.userId, metadata: op.metadata }
        );

        // Remove from queue on success
        const index = failedOperationsQueue.findIndex(f => f.id === op.id);
        if (index !== -1) {
          failedOperationsQueue.splice(index, 1);
        }

        successCount++;
        log('info', 'Retried operation succeeded', { operationId: op.id });
      }
    } catch (error) {
      log('warn', 'Retry failed for operation', {
        operationId: op.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  log('info', 'Retry batch completed', {
    attempted: operationsToRetry.length,
    succeeded: successCount,
    remainingInQueue: failedOperationsQueue.length,
  });

  return successCount;
}

// ============================================
// Categorized Memory Operations
// ============================================

export async function addCategorizedMemory(
  content: string,
  category: MemoryCategory,
  additionalMetadata?: Partial<CategorizedMemoryMetadata>
): Promise<unknown> {
  const metadata: CategorizedMemoryMetadata = {
    category,
    ...additionalMetadata,
  };

  log('info', 'Adding categorized memory', { category, contentLength: content.length });
  return addMemory(content, metadata);
}

export async function searchByCategory(
  query: string,
  category: MemoryCategory,
  limit: number = 10
): Promise<Memory[]> {
  log('info', 'Searching memories by category', { query: query.substring(0, 50), category });

  const results = await searchMemories(query);
  const filtered = results.filter(m => {
    const meta = m.metadata as CategorizedMemoryMetadata | undefined;
    return meta?.category === category;
  });

  log('info', 'Category search completed', {
    totalResults: results.length,
    filteredResults: filtered.length,
    category
  });

  return filtered.slice(0, limit);
}

export async function getMemoriesByCategory(
  category: MemoryCategory,
  limit: number = 20
): Promise<Memory[]> {
  log('info', 'Getting all memories for category', { category, limit });

  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.getAll({ user_id: USER_ID });
    },
    'getAll',
    { userId: USER_ID }
  );

  if (!result) return [];

  const memories = (result as Memory[]).filter(m => {
    const meta = m.metadata as CategorizedMemoryMetadata | undefined;
    return meta?.category === category;
  });

  // Sort by recency
  memories.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });

  return memories.slice(0, limit);
}

export async function getCategoryStats(): Promise<Record<string, number>> {
  const result = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.getAll({ user_id: USER_ID });
    },
    'getAll',
    { userId: USER_ID }
  );

  const stats: Record<string, number> = {};
  const categories: MemoryCategory[] = [
    'user_preferences', 'implementation', 'troubleshooting',
    'component_context', 'project_overview', 'task_history',
    'entity_fact', 'conversation_insight', 'workflow_pattern'
  ];

  // Initialize all categories to 0
  for (const cat of categories) {
    stats[cat] = 0;
  }
  stats['uncategorized'] = 0;

  if (result) {
    for (const memory of result as Memory[]) {
      const meta = memory.metadata as CategorizedMemoryMetadata | undefined;
      const category = meta?.category || 'uncategorized';
      stats[category] = (stats[category] || 0) + 1;
    }
  }

  return stats;
}

// ============================================
// Temporal Memory Operations
// ============================================

export interface FactUpdate {
  content: string;
  category: MemoryCategory;
  entity?: string;                 // What entity this fact is about
  factKey?: string;                // Unique key for this type of fact (e.g., "user.preferred_theme")
  validFrom?: string;
  metadata?: Partial<TemporalMemoryMetadata>;
}

/**
 * Add or update a fact with temporal tracking.
 * If a similar fact exists, marks it as superseded.
 */
export async function upsertFact(update: FactUpdate): Promise<{ memoryId: string; superseded?: string }> {
  const now = new Date().toISOString();

  log('info', 'Upserting fact', {
    category: update.category,
    entity: update.entity,
    factKey: update.factKey,
  });

  // Search for existing facts on this topic/entity
  let supersededId: string | undefined;

  if (update.entity || update.factKey) {
    const searchQuery = update.factKey || `${update.entity} ${update.category}`;
    const existing = await searchMemories(searchQuery);

    // Find the most relevant existing fact that's marked as current
    for (const memory of existing) {
      const meta = memory.metadata as TemporalMemoryMetadata | undefined;
      if (meta?.is_current && meta?.category === update.category) {
        // Check if it's about the same entity/factKey
        if (
          (update.entity && memory.memory.toLowerCase().includes(update.entity.toLowerCase())) ||
          (update.factKey && (meta as Record<string, unknown>).factKey === update.factKey)
        ) {
          supersededId = memory.id;
          log('info', 'Found existing fact to supersede', { oldId: supersededId });
          break;
        }
      }
    }
  }

  // Create the new fact with temporal metadata
  const metadata: TemporalMemoryMetadata = {
    category: update.category,
    t_valid_from: update.validFrom || now,
    t_ingested: now,
    is_current: true,
    supersedes_memory_id: supersededId,
    fact_type: 'dynamic',
    ...update.metadata,
  };

  if (update.entity) {
    metadata.related_entities = [update.entity];
  }
  if (update.factKey) {
    (metadata as Record<string, unknown>).factKey = update.factKey;
  }

  const result = await addMemory(update.content, metadata);

  // Extract the new memory ID from result if available
  const memoryId = (result as Record<string, unknown>)?.id as string || 'unknown';

  log('info', 'Fact upserted successfully', {
    newId: memoryId,
    supersededId,
  });

  return { memoryId, superseded: supersededId };
}

/**
 * Get the current value of a fact by key or entity.
 */
export async function getCurrentFact(
  query: string,
  category?: MemoryCategory
): Promise<Memory | null> {
  const results = await searchMemories(query);

  for (const memory of results) {
    const meta = memory.metadata as TemporalMemoryMetadata | undefined;

    // Check if this fact is current
    if (meta?.is_current !== false) {
      // Check category if specified
      if (!category || meta?.category === category) {
        // Check if not expired
        if (!meta?.t_valid_until || new Date(meta.t_valid_until) > new Date()) {
          return memory;
        }
      }
    }
  }

  return null;
}

/**
 * Get the history of a fact over time.
 */
export async function getFactHistory(
  query: string,
  category?: MemoryCategory
): Promise<Memory[]> {
  const results = await searchMemories(query);

  const relevantMemories = results.filter(memory => {
    const meta = memory.metadata as TemporalMemoryMetadata | undefined;
    return !category || meta?.category === category;
  });

  // Sort by t_valid_from or created_at (oldest first for history)
  relevantMemories.sort((a, b) => {
    const metaA = a.metadata as TemporalMemoryMetadata | undefined;
    const metaB = b.metadata as TemporalMemoryMetadata | undefined;
    const dateA = metaA?.t_valid_from || a.created_at || '';
    const dateB = metaB?.t_valid_from || b.created_at || '';
    return dateA.localeCompare(dateB);
  });

  return relevantMemories;
}

/**
 * Mark a fact as no longer valid.
 */
export async function invalidateFact(
  memoryId: string,
  reason?: string
): Promise<void> {
  // Since we can't directly update Mem0, we add a "invalidation" memory
  const now = new Date().toISOString();

  await addMemory(
    `[INVALIDATED] Memory ${memoryId} was marked as invalid. Reason: ${reason || 'Not specified'}`,
    {
      category: 'system',
      invalidates_memory_id: memoryId,
      archive_reason: reason,
      t_ingested: now,
      is_current: false,
    }
  );

  log('info', 'Fact invalidated', { memoryId, reason });
}

// ============================================
// Enhanced Relevance with Effectiveness
// ============================================

// Import from db for effectiveness tracking
import { getMemoryEffectiveness, getMostEffectiveMemoryIds } from './db';

/**
 * Get memories with combined relevance scoring including historical effectiveness
 * Score = 0.45 * semantic + 0.20 * recency + 0.15 * importance + 0.20 * effectiveness
 */
export async function getRelevantMemoriesWithFeedback(
  query: string,
  limit: number = 5
): Promise<MemoryWithImportance[]> {
  log('info', 'Getting relevant memories with feedback scoring', { query: query.substring(0, 50), limit });

  // Get semantic search results, all memories, and effective memory IDs in parallel
  const [searchResults, allMemories, effectiveIds] = await Promise.all([
    searchMemories(query),
    withRetry(
      async () => {
        const mem0 = getMem0Client();
        return await mem0.getAll({ user_id: USER_ID });
      },
      'getAll',
      { userId: USER_ID }
    ),
    getMostEffectiveMemoryIds(100).catch(() => [] as string[]),
  ]);

  if (!allMemories || (allMemories as Memory[]).length === 0) {
    return searchResults.slice(0, limit).map(m => ({
      ...m,
      importance_score: 0.5,
      retrieval_count: 0,
    }));
  }

  const memories = allMemories as Memory[];
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  // Create maps for quick lookup
  const searchScoreMap = new Map<string, number>();
  searchResults.forEach((result, index) => {
    const score = 1 - (index / Math.max(searchResults.length, 1));
    searchScoreMap.set(result.id, score);
  });

  const effectiveIdsSet = new Set(effectiveIds);

  // Score all memories
  const scoredMemories: MemoryWithImportance[] = await Promise.all(
    memories.map(async memory => {
      // Semantic relevance (from search position)
      const semanticScore = searchScoreMap.get(memory.id) || 0;

      // Recency score
      const createdAt = memory.created_at ? new Date(memory.created_at).getTime() : 0;
      const age = now - createdAt;
      const recencyScore = Math.max(0, 1 - (age / oneWeekMs));

      // Importance score
      const importanceScore = 0.5;

      // Effectiveness score (from feedback history)
      let effectivenessScore = 0.5; // Default
      try {
        const effectiveness = await getMemoryEffectiveness(memory.id);
        if (effectiveness) {
          effectivenessScore = effectiveness.effectivenessScore;
        } else if (effectiveIdsSet.has(memory.id)) {
          effectivenessScore = 0.7; // Boost if in effective list
        }
      } catch {
        // DB not available, use default
      }

      // Combined score with effectiveness
      const combinedScore =
        0.45 * semanticScore +
        0.20 * recencyScore +
        0.15 * importanceScore +
        0.20 * effectivenessScore;

      return {
        ...memory,
        score: combinedScore,
        importance_score: importanceScore,
        retrieval_count: 0,
      };
    })
  );

  // Sort and return
  scoredMemories.sort((a, b) => (b.score || 0) - (a.score || 0));

  const result = scoredMemories.slice(0, limit);
  log('info', 'Relevant memories with feedback scored', {
    totalScored: scoredMemories.length,
    returned: result.length,
    topScore: result[0]?.score || 0,
  });

  return result;
}

// ============================================
// Memory Maintenance & Pruning
// ============================================

export interface PruningResult {
  analyzed: number;
  pruned: number;
  consolidated: number;
  errors: string[];
}

/**
 * Identify memories that should be pruned based on:
 * - Low effectiveness score
 * - Superseded by newer facts
 * - Very old and never retrieved
 */
export async function identifyPruneCandidates(): Promise<{
  lowEffectiveness: Memory[];
  superseded: Memory[];
  stale: Memory[];
}> {
  log('info', 'Identifying prune candidates');

  const allMemories = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.getAll({ user_id: USER_ID });
    },
    'getAll',
    { userId: USER_ID }
  );

  if (!allMemories) {
    return { lowEffectiveness: [], superseded: [], stale: [] };
  }

  const memories = allMemories as Memory[];
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const lowEffectiveness: Memory[] = [];
  const superseded: Memory[] = [];
  const stale: Memory[] = [];

  for (const memory of memories) {
    const meta = memory.metadata as TemporalMemoryMetadata | undefined;

    // Check if superseded
    if (meta?.superseded_by || meta?.is_current === false) {
      superseded.push(memory);
      continue;
    }

    // Check effectiveness
    try {
      const effectiveness = await getMemoryEffectiveness(memory.id);
      if (effectiveness && effectiveness.timesRetrieved >= 5 && effectiveness.effectivenessScore < 0.2) {
        lowEffectiveness.push(memory);
        continue;
      }

      // Check staleness (old and never retrieved)
      const createdAt = memory.created_at ? new Date(memory.created_at).getTime() : 0;
      const age = now - createdAt;
      if (age > thirtyDaysMs && (!effectiveness || effectiveness.timesRetrieved === 0)) {
        stale.push(memory);
      }
    } catch {
      // DB not available, skip effectiveness check
    }
  }

  log('info', 'Prune candidates identified', {
    lowEffectiveness: lowEffectiveness.length,
    superseded: superseded.length,
    stale: stale.length,
  });

  return { lowEffectiveness, superseded, stale };
}

/**
 * Find memories that are semantically similar and could be consolidated.
 */
export async function findSimilarMemories(
  threshold: number = 0.85
): Promise<Array<{ primary: Memory; duplicates: Memory[] }>> {
  log('info', 'Finding similar memories for consolidation', { threshold });

  const allMemories = await withRetry(
    async () => {
      const mem0 = getMem0Client();
      return await mem0.getAll({ user_id: USER_ID });
    },
    'getAll',
    { userId: USER_ID }
  );

  if (!allMemories) return [];

  const memories = allMemories as Memory[];
  const groups: Array<{ primary: Memory; duplicates: Memory[] }> = [];
  const processed = new Set<string>();

  for (const memory of memories) {
    if (processed.has(memory.id)) continue;

    // Search for similar memories
    const similar = await searchMemories(memory.memory);

    const duplicates: Memory[] = [];
    for (const match of similar) {
      if (match.id !== memory.id && !processed.has(match.id)) {
        // Check if score indicates high similarity
        if (match.score && match.score >= threshold) {
          duplicates.push(match);
          processed.add(match.id);
        }
      }
    }

    if (duplicates.length > 0) {
      groups.push({ primary: memory, duplicates });
      processed.add(memory.id);
    }
  }

  log('info', 'Similar memory groups found', { groupCount: groups.length });
  return groups;
}

/**
 * Archive a memory (add to archive, mark original as archived).
 * Since Mem0 doesn't support deletion, we mark memories as archived.
 */
export async function archiveMemory(memoryId: string, reason: string): Promise<void> {
  log('info', 'Archiving memory', { memoryId, reason });

  await addMemory(
    `[ARCHIVED] Memory ${memoryId} archived. Reason: ${reason}`,
    {
      category: 'system',
      archived_memory_id: memoryId,
      archive_reason: reason,
      t_ingested: new Date().toISOString(),
      is_current: false,
    }
  );
}

/**
 * Run memory maintenance: identify and handle prune candidates.
 * Returns a summary of actions taken.
 */
export async function runMemoryMaintenance(
  dryRun: boolean = true
): Promise<PruningResult> {
  log('info', 'Running memory maintenance', { dryRun });

  const result: PruningResult = {
    analyzed: 0,
    pruned: 0,
    consolidated: 0,
    errors: [],
  };

  try {
    // Get prune candidates
    const { lowEffectiveness, superseded, stale } = await identifyPruneCandidates();
    result.analyzed = lowEffectiveness.length + superseded.length + stale.length;

    if (!dryRun) {
      // Archive superseded memories
      for (const memory of superseded) {
        try {
          await archiveMemory(memory.id, 'superseded by newer information');
          result.pruned++;
        } catch (e) {
          result.errors.push(`Failed to archive ${memory.id}: ${e}`);
        }
      }

      // Archive low effectiveness memories
      for (const memory of lowEffectiveness) {
        try {
          await archiveMemory(memory.id, 'consistently low effectiveness');
          result.pruned++;
        } catch (e) {
          result.errors.push(`Failed to archive ${memory.id}: ${e}`);
        }
      }

      // Archive stale memories
      for (const memory of stale) {
        try {
          await archiveMemory(memory.id, 'stale - never retrieved');
          result.pruned++;
        } catch (e) {
          result.errors.push(`Failed to archive ${memory.id}: ${e}`);
        }
      }
    }

    // Find and consolidate similar memories
    const similarGroups = await findSimilarMemories();

    if (!dryRun) {
      for (const group of similarGroups) {
        try {
          // Keep the most recent one, archive duplicates
          const sorted = [group.primary, ...group.duplicates].sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });

          // Archive all but the most recent
          for (let i = 1; i < sorted.length; i++) {
            await archiveMemory(sorted[i].id, `duplicate of ${sorted[0].id}`);
            result.consolidated++;
          }
        } catch (e) {
          result.errors.push(`Failed to consolidate group: ${e}`);
        }
      }
    } else {
      result.consolidated = similarGroups.reduce((sum, g) => sum + g.duplicates.length, 0);
    }

    log('info', 'Memory maintenance completed', result);
  } catch (e) {
    result.errors.push(`Maintenance failed: ${e}`);
    log('error', 'Memory maintenance failed', { error: String(e) });
  }

  return result;
}

export default getMem0Client;
