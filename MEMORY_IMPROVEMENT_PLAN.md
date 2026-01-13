# Albert Memory System Improvement Plan

## Overview

This plan implements 6 major improvements to Albert's memory and task completion capabilities. Follow each phase in order, testing after each phase before proceeding.

**Repository**: `/home/user/Albert`
**Branch**: `claude/improve-albert-memory-SywMT`

---

## Phase 1: Task Memory & Completion Tracking

**Goal**: Enable Albert to remember tasks across sessions and resume interrupted work.

### 1.1 Add Database Schema

**File**: `lib/db.ts`

Add this table creation in the `initializeDatabase()` function (around line 280):

```sql
CREATE TABLE IF NOT EXISTS task_memory (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  user_id TEXT DEFAULT 'default-voice-user',
  task_description TEXT NOT NULL,
  task_type TEXT CHECK(task_type IN ('research', 'build', 'browser', 'general', 'notebooklm')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'blocked', 'cancelled')),
  priority INTEGER DEFAULT 0,
  subtasks TEXT,
  completed_subtasks TEXT,
  blockers TEXT,
  context TEXT,
  tools_used TEXT,
  error_message TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  parent_task_id TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (parent_task_id) REFERENCES task_memory(id)
);

CREATE INDEX IF NOT EXISTS idx_task_memory_user ON task_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_task_memory_status ON task_memory(status);
CREATE INDEX IF NOT EXISTS idx_task_memory_conversation ON task_memory(conversation_id);
```

### 1.2 Add TypeScript Types

**File**: `lib/db/schema.ts`

Add these type definitions:

```typescript
export type TaskType = 'research' | 'build' | 'browser' | 'general' | 'notebooklm';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'cancelled';

export interface TaskMemory {
  id: string;
  conversation_id?: string;
  user_id: string;
  task_description: string;
  task_type?: TaskType;
  status: TaskStatus;
  priority: number;
  subtasks?: string[];        // JSON parsed
  completed_subtasks?: string[]; // JSON parsed
  blockers?: string[];        // JSON parsed
  context?: string;
  tools_used?: string[];      // JSON parsed
  error_message?: string;
  started_at: Date;
  updated_at: Date;
  completed_at?: Date;
  parent_task_id?: string;
}

export interface CreateTaskInput {
  task_description: string;
  task_type?: TaskType;
  conversation_id?: string;
  user_id?: string;
  subtasks?: string[];
  priority?: number;
  parent_task_id?: string;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  subtasks?: string[];
  completed_subtasks?: string[];
  blockers?: string[];
  context?: string;
  tools_used?: string[];
  error_message?: string;
}
```

### 1.3 Add Database Functions

**File**: `lib/db.ts`

Add these functions after the existing database functions:

```typescript
// ============================================
// Task Memory Functions
// ============================================

export async function createTask(input: CreateTaskInput): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO task_memory (id, conversation_id, user_id, task_description, task_type, subtasks, priority, parent_task_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.conversation_id || null,
      input.user_id || 'default-voice-user',
      input.task_description,
      input.task_type || 'general',
      input.subtasks ? JSON.stringify(input.subtasks) : null,
      input.priority || 0,
      input.parent_task_id || null,
    ],
  });

  return id;
}

export async function updateTask(taskId: string, updates: UpdateTaskInput): Promise<void> {
  const db = getDb();
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const args: (string | number | null)[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    args.push(updates.status);
    if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
      setClauses.push('completed_at = CURRENT_TIMESTAMP');
    }
  }
  if (updates.subtasks !== undefined) {
    setClauses.push('subtasks = ?');
    args.push(JSON.stringify(updates.subtasks));
  }
  if (updates.completed_subtasks !== undefined) {
    setClauses.push('completed_subtasks = ?');
    args.push(JSON.stringify(updates.completed_subtasks));
  }
  if (updates.blockers !== undefined) {
    setClauses.push('blockers = ?');
    args.push(JSON.stringify(updates.blockers));
  }
  if (updates.context !== undefined) {
    setClauses.push('context = ?');
    args.push(updates.context);
  }
  if (updates.tools_used !== undefined) {
    setClauses.push('tools_used = ?');
    args.push(JSON.stringify(updates.tools_used));
  }
  if (updates.error_message !== undefined) {
    setClauses.push('error_message = ?');
    args.push(updates.error_message);
  }

  args.push(taskId);

  await db.execute({
    sql: `UPDATE task_memory SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function getTask(taskId: string): Promise<TaskMemory | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM task_memory WHERE id = ?',
    args: [taskId],
  });

  if (result.rows.length === 0) return null;
  return parseTaskRow(result.rows[0]);
}

export async function getActiveTasks(userId: string = 'default-voice-user'): Promise<TaskMemory[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM task_memory
          WHERE user_id = ? AND status IN ('pending', 'in_progress', 'blocked')
          ORDER BY priority DESC, started_at ASC`,
    args: [userId],
  });

  return result.rows.map(parseTaskRow);
}

export async function getRecentTasks(userId: string = 'default-voice-user', limit: number = 10): Promise<TaskMemory[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM task_memory
          WHERE user_id = ?
          ORDER BY updated_at DESC
          LIMIT ?`,
    args: [userId, limit],
  });

  return result.rows.map(parseTaskRow);
}

export async function getTasksByConversation(conversationId: string): Promise<TaskMemory[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM task_memory WHERE conversation_id = ? ORDER BY started_at ASC',
    args: [conversationId],
  });

  return result.rows.map(parseTaskRow);
}

export async function getIncompleteTasksSummary(userId: string = 'default-voice-user'): Promise<string> {
  const tasks = await getActiveTasks(userId);
  if (tasks.length === 0) return '';

  const lines = ['Incomplete tasks from previous sessions:'];
  for (const task of tasks) {
    const statusEmoji = task.status === 'blocked' ? '🚫' : task.status === 'in_progress' ? '🔄' : '⏳';
    lines.push(`${statusEmoji} ${task.task_description}`);
    if (task.blockers && task.blockers.length > 0) {
      lines.push(`   Blocked by: ${task.blockers.join(', ')}`);
    }
    if (task.subtasks && task.completed_subtasks) {
      const remaining = task.subtasks.length - task.completed_subtasks.length;
      if (remaining > 0) {
        lines.push(`   ${remaining} subtasks remaining`);
      }
    }
  }

  return lines.join('\n');
}

function parseTaskRow(row: any): TaskMemory {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    task_description: row.task_description,
    task_type: row.task_type,
    status: row.status,
    priority: row.priority || 0,
    subtasks: row.subtasks ? JSON.parse(row.subtasks) : undefined,
    completed_subtasks: row.completed_subtasks ? JSON.parse(row.completed_subtasks) : undefined,
    blockers: row.blockers ? JSON.parse(row.blockers) : undefined,
    context: row.context,
    tools_used: row.tools_used ? JSON.parse(row.tools_used) : undefined,
    error_message: row.error_message,
    started_at: new Date(row.started_at),
    updated_at: new Date(row.updated_at),
    completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
    parent_task_id: row.parent_task_id,
  };
}
```

### 1.4 Add API Endpoint

**File**: Create `app/api/tasks/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  createTask,
  updateTask,
  getTask,
  getActiveTasks,
  getRecentTasks,
  getIncompleteTasksSummary,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'default-voice-user';
  const taskId = searchParams.get('taskId');
  const type = searchParams.get('type') || 'active'; // 'active', 'recent', 'summary', 'single'

  try {
    if (type === 'single' && taskId) {
      const task = await getTask(taskId);
      return NextResponse.json({ task });
    }

    if (type === 'summary') {
      const summary = await getIncompleteTasksSummary(userId);
      return NextResponse.json({ summary });
    }

    if (type === 'recent') {
      const limit = parseInt(searchParams.get('limit') || '10');
      const tasks = await getRecentTasks(userId, limit);
      return NextResponse.json({ tasks });
    }

    // Default: active tasks
    const tasks = await getActiveTasks(userId);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const taskId = await createTask(body);
    return NextResponse.json({ taskId });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, ...updates } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    await updateTask(taskId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
```

### 1.5 Integrate with Conversation Context

**File**: `app/api/conversation/context/route.ts`

Add task context to the conversation context retrieval. Find where the context object is built and add:

```typescript
// Add to the parallel fetch operations
const [
  // ... existing fetches
  incompleteTasksSummary,
] = await Promise.all([
  // ... existing promises
  getIncompleteTasksSummary(userId),
]);

// Add to the returned context
return NextResponse.json({
  // ... existing fields
  incompleteTasksSummary,
});
```

### 1.6 Testing Phase 1

Run these tests to verify Phase 1:

```bash
# Start the dev server
npm run dev

# Test task creation
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"task_description": "Test task", "task_type": "general"}'

# Test task retrieval
curl "http://localhost:3000/api/tasks?type=active"

# Test task update
curl -X PATCH http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"taskId": "<id-from-above>", "status": "in_progress"}'
```

---

## Phase 2: Memory Categories

**Goal**: Organize memories by category for better retrieval precision.

### 2.1 Add Category Types

**File**: `lib/mem0.ts`

Add after the existing type definitions (around line 165):

```typescript
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
```

### 2.2 Add Categorized Memory Functions

**File**: `lib/mem0.ts`

Add these functions after the existing memory functions:

```typescript
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

export async function getCategoryStats(): Promise<Record<MemoryCategory, number>> {
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

  return stats as Record<MemoryCategory, number>;
}
```

### 2.3 Add Memory Category API

**File**: Create `app/api/memory/categories/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  addCategorizedMemory,
  searchByCategory,
  getMemoriesByCategory,
  getCategoryStats,
  type MemoryCategory,
} from '@/lib/mem0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category') as MemoryCategory | null;
  const query = searchParams.get('query');
  const type = searchParams.get('type') || 'list'; // 'list', 'search', 'stats'
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    if (type === 'stats') {
      const stats = await getCategoryStats();
      return NextResponse.json({ stats });
    }

    if (type === 'search' && query && category) {
      const memories = await searchByCategory(query, category, limit);
      return NextResponse.json({ memories });
    }

    if (category) {
      const memories = await getMemoriesByCategory(category, limit);
      return NextResponse.json({ memories });
    }

    return NextResponse.json({ error: 'Category required for list' }, { status: 400 });
  } catch (error) {
    console.error('Error with category memory:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, category, ...metadata } = body;

    if (!content || !category) {
      return NextResponse.json(
        { error: 'content and category required' },
        { status: 400 }
      );
    }

    const result = await addCategorizedMemory(content, category, metadata);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error adding categorized memory:', error);
    return NextResponse.json({ error: 'Failed to add memory' }, { status: 500 });
  }
}
```

### 2.4 Testing Phase 2

```bash
# Add categorized memory
curl -X POST http://localhost:3000/api/memory/categories \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers dark mode in all applications", "category": "user_preferences"}'

# Get category stats
curl "http://localhost:3000/api/memory/categories?type=stats"

# Search within category
curl "http://localhost:3000/api/memory/categories?type=search&category=user_preferences&query=dark%20mode"
```

---

## Phase 3: Temporal Tracking

**Goal**: Track when facts become true/false to handle changing information.

### 3.1 Add Temporal Types

**File**: `lib/mem0.ts`

Add after the `CategorizedMemoryMetadata` interface:

```typescript
// ============================================
// Temporal Memory Types
// ============================================

export interface TemporalMemoryMetadata extends CategorizedMemoryMetadata {
  t_valid_from?: string;           // ISO timestamp when fact became true
  t_valid_until?: string;          // ISO timestamp when fact stopped being true
  t_ingested: string;              // ISO timestamp when we learned this
  supersedes_memory_id?: string;   // ID of older memory this replaces
  superseded_by?: string;          // ID of memory that replaced this one
  is_current: boolean;             // Whether this is the current known fact
  fact_type?: 'static' | 'dynamic'; // Static facts rarely change, dynamic facts may update
}

export interface FactUpdate {
  content: string;
  category: MemoryCategory;
  entity?: string;                 // What entity this fact is about
  factKey?: string;                // Unique key for this type of fact (e.g., "user.preferred_theme")
  validFrom?: string;
  metadata?: Partial<TemporalMemoryMetadata>;
}
```

### 3.2 Add Temporal Memory Functions

**File**: `lib/mem0.ts`

Add these functions:

```typescript
// ============================================
// Temporal Memory Operations
// ============================================

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
          (update.factKey && meta.factKey === update.factKey)
        ) {
          supersededId = memory.id;

          // Mark the old fact as superseded (we can't update Mem0 directly, so we track this)
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
    (metadata as any).factKey = update.factKey;
  }

  const result = await addMemory(update.content, metadata);

  // Extract the new memory ID from result if available
  const memoryId = (result as any)?.id || 'unknown';

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
      t_ingested: now,
      is_current: false,
    }
  );

  log('info', 'Fact invalidated', { memoryId, reason });
}
```

### 3.3 Add Temporal API

**File**: Create `app/api/memory/facts/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  upsertFact,
  getCurrentFact,
  getFactHistory,
  invalidateFact,
  type MemoryCategory,
} from '@/lib/mem0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const category = searchParams.get('category') as MemoryCategory | undefined;
  const type = searchParams.get('type') || 'current'; // 'current', 'history'

  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 });
  }

  try {
    if (type === 'history') {
      const history = await getFactHistory(query, category);
      return NextResponse.json({ history });
    }

    const fact = await getCurrentFact(query, category);
    return NextResponse.json({ fact });
  } catch (error) {
    console.error('Error fetching fact:', error);
    return NextResponse.json({ error: 'Failed to fetch fact' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, category, entity, factKey, validFrom, ...metadata } = body;

    if (!content || !category) {
      return NextResponse.json(
        { error: 'content and category required' },
        { status: 400 }
      );
    }

    const result = await upsertFact({
      content,
      category,
      entity,
      factKey,
      validFrom,
      metadata,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error upserting fact:', error);
    return NextResponse.json({ error: 'Failed to upsert fact' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const memoryId = searchParams.get('memoryId');
  const reason = searchParams.get('reason');

  if (!memoryId) {
    return NextResponse.json({ error: 'memoryId required' }, { status: 400 });
  }

  try {
    await invalidateFact(memoryId, reason || undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error invalidating fact:', error);
    return NextResponse.json({ error: 'Failed to invalidate fact' }, { status: 500 });
  }
}
```

### 3.4 Testing Phase 3

```bash
# Add a fact
curl -X POST http://localhost:3000/api/memory/facts \
  -H "Content-Type: application/json" \
  -d '{"content": "User works at Acme Corp", "category": "entity_fact", "entity": "user", "factKey": "user.employer"}'

# Update the fact (supersedes old one)
curl -X POST http://localhost:3000/api/memory/facts \
  -H "Content-Type: application/json" \
  -d '{"content": "User now works at NewCo Inc", "category": "entity_fact", "entity": "user", "factKey": "user.employer"}'

# Get current fact
curl "http://localhost:3000/api/memory/facts?query=user%20employer&category=entity_fact"

# Get fact history
curl "http://localhost:3000/api/memory/facts?query=user%20employer&type=history"
```

---

## Phase 4: Feedback Loop for Memory Retrieval

**Goal**: Track which memories lead to good responses and improve retrieval over time.

### 4.1 Add Feedback Schema

**File**: `lib/db.ts`

Add to `initializeDatabase()`:

```sql
CREATE TABLE IF NOT EXISTS memory_usage_feedback (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  memory_ids TEXT NOT NULL,
  response_rating TEXT CHECK(response_rating IN ('positive', 'negative', 'neutral')),
  task_completed INTEGER DEFAULT 0,
  feedback_text TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS memory_effectiveness (
  memory_id TEXT PRIMARY KEY,
  times_retrieved INTEGER DEFAULT 0,
  times_helpful INTEGER DEFAULT 0,
  times_unhelpful INTEGER DEFAULT 0,
  effectiveness_score REAL DEFAULT 0.5,
  last_used TEXT,
  last_feedback TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_effectiveness_score ON memory_effectiveness(effectiveness_score DESC);
```

### 4.2 Add Feedback Functions

**File**: `lib/db.ts`

Add these functions:

```typescript
// ============================================
// Memory Feedback Functions
// ============================================

export async function recordMemoryUsage(
  memoryIds: string[],
  conversationId?: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO memory_usage_feedback (id, conversation_id, memory_ids) VALUES (?, ?, ?)`,
    args: [id, conversationId || null, JSON.stringify(memoryIds)],
  });

  // Update retrieval counts
  for (const memoryId of memoryIds) {
    await db.execute({
      sql: `INSERT INTO memory_effectiveness (memory_id, times_retrieved, last_used)
            VALUES (?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(memory_id) DO UPDATE SET
              times_retrieved = times_retrieved + 1,
              last_used = CURRENT_TIMESTAMP`,
      args: [memoryId],
    });
  }

  return id;
}

export async function recordMemoryFeedback(
  feedbackId: string,
  rating: 'positive' | 'negative' | 'neutral',
  taskCompleted: boolean,
  feedbackText?: string
): Promise<void> {
  const db = getDb();

  // Update the feedback record
  await db.execute({
    sql: `UPDATE memory_usage_feedback
          SET response_rating = ?, task_completed = ?, feedback_text = ?
          WHERE id = ?`,
    args: [rating, taskCompleted ? 1 : 0, feedbackText || null, feedbackId],
  });

  // Get the memory IDs from this feedback
  const result = await db.execute({
    sql: 'SELECT memory_ids FROM memory_usage_feedback WHERE id = ?',
    args: [feedbackId],
  });

  if (result.rows.length > 0) {
    const memoryIds = JSON.parse(result.rows[0].memory_ids as string) as string[];

    // Update effectiveness for each memory
    for (const memoryId of memoryIds) {
      const helpfulIncrement = rating === 'positive' ? 1 : 0;
      const unhelpfulIncrement = rating === 'negative' ? 1 : 0;

      await db.execute({
        sql: `UPDATE memory_effectiveness
              SET times_helpful = times_helpful + ?,
                  times_unhelpful = times_unhelpful + ?,
                  last_feedback = ?,
                  effectiveness_score = CAST(times_helpful + 1 AS REAL) / CAST(times_retrieved + 2 AS REAL)
              WHERE memory_id = ?`,
        args: [helpfulIncrement, unhelpfulIncrement, rating, memoryId],
      });
    }
  }
}

export async function getMemoryEffectiveness(memoryId: string): Promise<{
  timesRetrieved: number;
  timesHelpful: number;
  timesUnhelpful: number;
  effectivenessScore: number;
} | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM memory_effectiveness WHERE memory_id = ?',
    args: [memoryId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    timesRetrieved: row.times_retrieved as number,
    timesHelpful: row.times_helpful as number,
    timesUnhelpful: row.times_unhelpful as number,
    effectivenessScore: row.effectiveness_score as number,
  };
}

export async function getMostEffectiveMemoryIds(limit: number = 50): Promise<string[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT memory_id FROM memory_effectiveness
          WHERE times_retrieved >= 2
          ORDER BY effectiveness_score DESC
          LIMIT ?`,
    args: [limit],
  });

  return result.rows.map(row => row.memory_id as string);
}

export async function getLeastEffectiveMemoryIds(limit: number = 50): Promise<string[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT memory_id FROM memory_effectiveness
          WHERE times_retrieved >= 3 AND effectiveness_score < 0.3
          ORDER BY effectiveness_score ASC
          LIMIT ?`,
    args: [limit],
  });

  return result.rows.map(row => row.memory_id as string);
}
```

### 4.3 Update Relevance Scoring

**File**: `lib/mem0.ts`

Update the `getRelevantMemories` function to incorporate effectiveness:

```typescript
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
    getMostEffectiveMemoryIds(100),
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
      const effectiveness = await getMemoryEffectiveness(memory.id);
      if (effectiveness) {
        effectivenessScore = effectiveness.effectivenessScore;
      } else if (effectiveIdsSet.has(memory.id)) {
        effectivenessScore = 0.7; // Boost if in effective list
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
        retrieval_count: effectiveness?.timesRetrieved || 0,
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
```

### 4.4 Add Feedback API

**File**: Create `app/api/memory/feedback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  recordMemoryUsage,
  recordMemoryFeedback,
  getMemoryEffectiveness,
  getMostEffectiveMemoryIds,
  getLeastEffectiveMemoryIds,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'effective'; // 'effective', 'ineffective', 'single'
  const memoryId = searchParams.get('memoryId');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    if (type === 'single' && memoryId) {
      const effectiveness = await getMemoryEffectiveness(memoryId);
      return NextResponse.json({ effectiveness });
    }

    if (type === 'ineffective') {
      const ids = await getLeastEffectiveMemoryIds(limit);
      return NextResponse.json({ memoryIds: ids });
    }

    // Default: most effective
    const ids = await getMostEffectiveMemoryIds(limit);
    return NextResponse.json({ memoryIds: ids });
  } catch (error) {
    console.error('Error fetching memory effectiveness:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, memoryIds, feedbackId, rating, taskCompleted, feedbackText, conversationId } = body;

    if (action === 'record_usage') {
      if (!memoryIds || !Array.isArray(memoryIds)) {
        return NextResponse.json({ error: 'memoryIds array required' }, { status: 400 });
      }
      const id = await recordMemoryUsage(memoryIds, conversationId);
      return NextResponse.json({ feedbackId: id });
    }

    if (action === 'record_feedback') {
      if (!feedbackId || !rating) {
        return NextResponse.json({ error: 'feedbackId and rating required' }, { status: 400 });
      }
      await recordMemoryFeedback(feedbackId, rating, taskCompleted || false, feedbackText);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error recording feedback:', error);
    return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
  }
}
```

### 4.5 Testing Phase 4

```bash
# Record memory usage
curl -X POST http://localhost:3000/api/memory/feedback \
  -H "Content-Type: application/json" \
  -d '{"action": "record_usage", "memoryIds": ["mem-123", "mem-456"]}'

# Record feedback (use feedbackId from above)
curl -X POST http://localhost:3000/api/memory/feedback \
  -H "Content-Type: application/json" \
  -d '{"action": "record_feedback", "feedbackId": "<id>", "rating": "positive", "taskCompleted": true}'

# Get most effective memories
curl "http://localhost:3000/api/memory/feedback?type=effective"

# Get ineffective memories (candidates for pruning)
curl "http://localhost:3000/api/memory/feedback?type=ineffective"
```

---

## Phase 5: Memory Pruning & Consolidation

**Goal**: Prevent memory bloat by removing outdated, redundant, or ineffective memories.

### 5.1 Add Pruning Functions

**File**: `lib/mem0.ts`

Add these functions:

```typescript
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
```

### 5.2 Add Maintenance API

**File**: Create `app/api/memory/maintenance/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  identifyPruneCandidates,
  findSimilarMemories,
  runMemoryMaintenance,
  archiveMemory,
} from '@/lib/mem0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'candidates'; // 'candidates', 'similar'

  try {
    if (type === 'similar') {
      const groups = await findSimilarMemories();
      return NextResponse.json({
        groupCount: groups.length,
        groups: groups.map(g => ({
          primaryId: g.primary.id,
          primaryContent: g.primary.memory.substring(0, 100),
          duplicateCount: g.duplicates.length,
          duplicateIds: g.duplicates.map(d => d.id),
        })),
      });
    }

    // Default: prune candidates
    const candidates = await identifyPruneCandidates();
    return NextResponse.json({
      summary: {
        lowEffectiveness: candidates.lowEffectiveness.length,
        superseded: candidates.superseded.length,
        stale: candidates.stale.length,
        total: candidates.lowEffectiveness.length +
               candidates.superseded.length +
               candidates.stale.length,
      },
      candidates: {
        lowEffectiveness: candidates.lowEffectiveness.map(m => ({
          id: m.id,
          content: m.memory.substring(0, 100),
        })),
        superseded: candidates.superseded.map(m => ({
          id: m.id,
          content: m.memory.substring(0, 100),
        })),
        stale: candidates.stale.map(m => ({
          id: m.id,
          content: m.memory.substring(0, 100),
        })),
      },
    });
  } catch (error) {
    console.error('Error analyzing memories:', error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, dryRun = true, memoryId, reason } = body;

    if (action === 'run_maintenance') {
      const result = await runMemoryMaintenance(dryRun);
      return NextResponse.json({
        dryRun,
        result,
        message: dryRun
          ? 'Dry run completed. Set dryRun: false to execute.'
          : 'Maintenance completed.',
      });
    }

    if (action === 'archive' && memoryId) {
      await archiveMemory(memoryId, reason || 'Manual archive');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error running maintenance:', error);
    return NextResponse.json({ error: 'Failed to run maintenance' }, { status: 500 });
  }
}
```

### 5.3 Testing Phase 5

```bash
# Get prune candidates (dry run analysis)
curl "http://localhost:3000/api/memory/maintenance?type=candidates"

# Find similar memories
curl "http://localhost:3000/api/memory/maintenance?type=similar"

# Run maintenance (dry run)
curl -X POST http://localhost:3000/api/memory/maintenance \
  -H "Content-Type: application/json" \
  -d '{"action": "run_maintenance", "dryRun": true}'

# Run maintenance (actual)
curl -X POST http://localhost:3000/api/memory/maintenance \
  -H "Content-Type: application/json" \
  -d '{"action": "run_maintenance", "dryRun": false}'

# Archive specific memory
curl -X POST http://localhost:3000/api/memory/maintenance \
  -H "Content-Type: application/json" \
  -d '{"action": "archive", "memoryId": "mem-123", "reason": "No longer relevant"}'
```

---

## Phase 6: MCP Memory Server Integration

**Goal**: Create an MCP server that exposes Albert's memory to other tools.

### 6.1 Create MCP Server

**File**: Create `lib/mcp/memoryServer.ts`

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import MemoryClient from 'mem0ai';

const USER_ID = 'echo_user';
const ECHO_SELF_ID = 'echo_self';

let mem0Client: MemoryClient | null = null;

function getMem0Client(): MemoryClient {
  if (!mem0Client) {
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
      throw new Error('MEM0_API_KEY not set');
    }
    mem0Client = new MemoryClient({ apiKey });
  }
  return mem0Client;
}

const server = new Server(
  {
    name: 'albert-memory',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_memory',
        description: 'Search Albert\'s memory for relevant information',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default: 5)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_memory',
        description: 'Add a new memory to Albert\'s knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The memory content to store',
            },
            category: {
              type: 'string',
              description: 'Category for the memory',
              enum: [
                'user_preferences',
                'implementation',
                'troubleshooting',
                'component_context',
                'project_overview',
                'task_history',
                'entity_fact',
                'conversation_insight',
                'workflow_pattern',
              ],
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'get_recent_memories',
        description: 'Get the most recent memories',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of memories to return (default: 10)',
            },
          },
        },
      },
      {
        name: 'get_context',
        description: 'Get relevant context for a topic from memory',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'The topic to get context for',
            },
          },
          required: ['topic'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const mem0 = getMem0Client();

  try {
    switch (name) {
      case 'search_memory': {
        const query = args?.query as string;
        const limit = (args?.limit as number) || 5;

        const results = await mem0.search(query, { user_id: USER_ID });
        const memories = (results as any[]).slice(0, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                memories.map((m: any) => ({
                  id: m.id,
                  content: m.memory,
                  score: m.score,
                  created_at: m.created_at,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'add_memory': {
        const content = args?.content as string;
        const category = args?.category as string;

        const metadata: Record<string, unknown> = {};
        if (category) {
          metadata.category = category;
        }
        metadata.t_ingested = new Date().toISOString();
        metadata.source = 'mcp';

        await mem0.add(
          [{ role: 'user', content }],
          { user_id: USER_ID, metadata }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Memory added successfully' }),
            },
          ],
        };
      }

      case 'get_recent_memories': {
        const limit = (args?.limit as number) || 10;

        const results = await mem0.getAll({ user_id: USER_ID });
        const memories = (results as any[])
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          })
          .slice(0, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                memories.map((m: any) => ({
                  id: m.id,
                  content: m.memory,
                  created_at: m.created_at,
                  metadata: m.metadata,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_context': {
        const topic = args?.topic as string;

        // Search for relevant memories
        const searchResults = await mem0.search(topic, { user_id: USER_ID });
        const memories = (searchResults as any[]).slice(0, 5);

        // Also search Echo's self-memories for relevant context
        const echoResults = await mem0.search(topic, { user_id: ECHO_SELF_ID });
        const echoMemories = (echoResults as any[]).slice(0, 3);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  topic,
                  userMemories: memories.map((m: any) => m.memory),
                  echoContext: echoMemories.map((m: any) => m.memory),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: String(error) }),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Albert Memory MCP Server running');
}

main().catch(console.error);
```

### 6.2 Add Package Scripts

**File**: Update `package.json`

Add to the `scripts` section:

```json
{
  "scripts": {
    "mcp:memory": "npx tsx lib/mcp/memoryServer.ts"
  }
}
```

### 6.3 Create MCP Configuration

**File**: Create `mcp-config.json` (for documentation/reference)

```json
{
  "mcpServers": {
    "albert-memory": {
      "command": "npm",
      "args": ["run", "mcp:memory"],
      "cwd": "/path/to/Albert",
      "env": {
        "MEM0_API_KEY": "${MEM0_API_KEY}"
      }
    }
  }
}
```

### 6.4 Install MCP SDK

Run this command:

```bash
npm install @modelcontextprotocol/sdk
```

### 6.5 Testing Phase 6

```bash
# Test the MCP server directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run mcp:memory

# Test search tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_memory","arguments":{"query":"user preferences"}}}' | npm run mcp:memory
```

---

## Final Integration Steps

### Update Conversation Context

**File**: `app/api/conversation/context/route.ts`

Ensure the context endpoint returns task memory and uses the new memory scoring:

```typescript
import { getIncompleteTasksSummary } from '@/lib/db';
import { getRelevantMemoriesWithFeedback } from '@/lib/mem0';

// In the GET handler, add:
const [
  // ... existing fetches
  incompleteTasksSummary,
] = await Promise.all([
  // ... existing promises
  getIncompleteTasksSummary(userId),
]);

// Use the feedback-aware memory retrieval
const memories = topic
  ? await getRelevantMemoriesWithFeedback(topic, 5)
  : await getRecentMemories(5);
```

### Add Cron Job for Maintenance

**File**: Create `app/api/cron/memory-maintenance/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { runMemoryMaintenance } from '@/lib/mem0';

// Vercel Cron or similar can call this endpoint daily
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runMemoryMaintenance(false);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Cron maintenance failed:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

### Add to vercel.json (if using Vercel)

```json
{
  "crons": [
    {
      "path": "/api/cron/memory-maintenance",
      "schedule": "0 3 * * *"
    }
  ]
}
```

---

## Testing Checklist

After implementing all phases, verify:

- [ ] **Phase 1**: Tasks are created, tracked, and retrieved correctly
- [ ] **Phase 2**: Memories can be added with categories and filtered
- [ ] **Phase 3**: Facts are tracked temporally and supersession works
- [ ] **Phase 4**: Feedback is recorded and affects retrieval scoring
- [ ] **Phase 5**: Maintenance identifies and handles prune candidates
- [ ] **Phase 6**: MCP server responds to all tool calls

## Environment Variables Needed

Ensure these are set:

```env
# Existing
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
MEM0_API_KEY=m0-...

# New (for cron)
CRON_SECRET=your-secret-here
```

---

## Commit and Push

After each phase, commit your changes:

```bash
git add .
git commit -m "feat: Implement Phase X - [description]"
git push -u origin claude/improve-albert-memory-SywMT
```

Final commit message example:
```
feat: Implement comprehensive memory improvements

- Phase 1: Task memory and completion tracking
- Phase 2: Memory categories for organized retrieval
- Phase 3: Temporal tracking for changing facts
- Phase 4: Feedback loop for memory effectiveness
- Phase 5: Memory pruning and consolidation
- Phase 6: MCP server for cross-tool memory access
```
