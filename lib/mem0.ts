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
    if (!process.env.MEM0_API_KEY) {
      log('error', 'MEM0_API_KEY not configured');
      throw new Error('MEM0_API_KEY environment variable is not set');
    }
    mem0Client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });
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
}

export interface MemoryWithImportance extends Memory {
  importance_score?: number;
  retrieval_count?: number;
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

export default getMem0Client;
