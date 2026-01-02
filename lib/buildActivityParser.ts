/**
 * Build Activity Parser - Transforms Claude Code SDK stream events
 * into human-readable activities for the real-time feed.
 */

export type ActivityType =
  | 'thinking'
  | 'file_write'
  | 'file_edit'
  | 'file_read'
  | 'command'
  | 'search'
  | 'decision'
  | 'web_fetch'
  | 'error'
  | 'complete';

export interface BuildActivity {
  id: string;
  timestamp: Date;
  type: ActivityType;
  summary: string;
  details?: string;
  filePath?: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  duration?: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

// Map SDK tool names to activity types
const TOOL_TYPE_MAP: Record<string, ActivityType> = {
  Write: 'file_write',
  Edit: 'file_edit',
  Read: 'file_read',
  Bash: 'command',
  Glob: 'search',
  Grep: 'search',
  WebFetch: 'web_fetch',
  WebSearch: 'web_fetch',
};

/**
 * Parse a Claude Code SDK stream event into a BuildActivity
 */
export function parseStreamEvent(event: unknown): BuildActivity | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const evt = event as Record<string, unknown>;
  const eventType = evt.type as string;

  // Handle content block start (tool use beginning)
  if (eventType === 'content_block_start') {
    const contentBlock = evt.content_block as Record<string, unknown> | undefined;
    if (contentBlock?.type === 'tool_use') {
      return createToolStartActivity(contentBlock);
    }
    if (contentBlock?.type === 'thinking') {
      return {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        type: 'thinking',
        summary: 'Thinking...',
        status: 'running',
      };
    }
  }

  // Handle content block delta (tool results, thinking content)
  if (eventType === 'content_block_delta') {
    const delta = evt.delta as Record<string, unknown> | undefined;
    if (delta?.type === 'thinking_delta') {
      return {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        type: 'thinking',
        summary: 'Analyzing...',
        details: delta.thinking as string,
        status: 'running',
      };
    }
    if (delta?.type === 'input_json_delta') {
      // Partial tool input - could track for progress
      return null;
    }
  }

  // Handle content block stop (tool completed)
  if (eventType === 'content_block_stop') {
    // This signals completion - handled by tracking
    return null;
  }

  // Handle message stop
  if (eventType === 'message_stop') {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type: 'complete',
      summary: 'Step complete',
      status: 'complete',
    };
  }

  return null;
}

/**
 * Create an activity for tool start
 */
function createToolStartActivity(contentBlock: Record<string, unknown>): BuildActivity {
  const toolName = contentBlock.name as string;
  const toolId = contentBlock.id as string || crypto.randomUUID();
  const activityType = TOOL_TYPE_MAP[toolName] || 'decision';

  return {
    id: toolId,
    timestamp: new Date(),
    type: activityType,
    summary: getToolSummary(toolName, {}),
    status: 'pending',
    toolName,
  };
}

/**
 * Update an activity with tool input once received
 */
export function updateActivityWithInput(
  activity: BuildActivity,
  input: Record<string, unknown>
): BuildActivity {
  return {
    ...activity,
    summary: getToolSummary(activity.toolName || '', input),
    details: formatToolDetails(activity.toolName || '', input),
    filePath: extractFilePath(activity.toolName || '', input),
    toolInput: input,
    status: 'running',
  };
}

/**
 * Mark an activity as complete
 */
export function completeActivity(
  activity: BuildActivity,
  success: boolean = true,
  output?: string
): BuildActivity {
  return {
    ...activity,
    status: success ? 'complete' : 'error',
    details: output || activity.details,
    duration: Date.now() - activity.timestamp.getTime(),
  };
}

/**
 * Generate a human-readable summary for a tool use
 */
function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Write':
      return `Creating ${getFileName(input.file_path as string)}`;
    case 'Edit':
      return `Editing ${getFileName(input.file_path as string)}`;
    case 'Read':
      return `Reading ${getFileName(input.file_path as string)}`;
    case 'Bash':
      const cmd = (input.command as string || '').slice(0, 50);
      return `Running: ${cmd}${cmd.length >= 50 ? '...' : ''}`;
    case 'Glob':
      return `Searching for ${input.pattern as string || 'files'}`;
    case 'Grep':
      return `Searching code for "${input.pattern as string || ''}"`;
    case 'WebFetch':
      return `Fetching ${input.url as string || 'URL'}`;
    case 'WebSearch':
      return `Searching web: ${input.query as string || ''}`;
    default:
      return `Using ${toolName}`;
  }
}

/**
 * Format detailed output for a tool use
 */
function formatToolDetails(toolName: string, input: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case 'Write':
      const content = input.content as string;
      if (content) {
        const lines = content.split('\n').length;
        return `${lines} lines of code`;
      }
      return undefined;
    case 'Edit':
      return `Replacing: "${(input.old_string as string || '').slice(0, 50)}..."`;
    case 'Bash':
      return input.command as string;
    default:
      return undefined;
  }
}

/**
 * Extract file path from tool input
 */
function extractFilePath(toolName: string, input: Record<string, unknown>): string | undefined {
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') {
    return input.file_path as string;
  }
  if (toolName === 'Glob' || toolName === 'Grep') {
    return input.path as string;
  }
  return undefined;
}

/**
 * Get just the filename from a path
 */
function getFileName(filePath: string | undefined): string {
  if (!filePath) return 'file';
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || 'file';
}

/**
 * Parse assistant message content for display
 */
export function parseAssistantMessage(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text?: string } =>
        typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text'
      )
      .map(c => c.text || '')
      .join('\n');
  }

  return String(content);
}

/**
 * Activity tracker for managing active activities
 */
export class ActivityTracker {
  private activities: Map<string, BuildActivity> = new Map();
  private listeners: Set<(activities: BuildActivity[]) => void> = new Set();

  /**
   * Add or update an activity
   */
  upsert(activity: BuildActivity): void {
    this.activities.set(activity.id, activity);
    this.notify();
  }

  /**
   * Get an activity by ID
   */
  get(id: string): BuildActivity | undefined {
    return this.activities.get(id);
  }

  /**
   * Mark an activity as complete
   */
  complete(id: string, success: boolean = true, output?: string): void {
    const activity = this.activities.get(id);
    if (activity) {
      this.activities.set(id, completeActivity(activity, success, output));
      this.notify();
    }
  }

  /**
   * Get all activities sorted by timestamp
   */
  getAll(): BuildActivity[] {
    return Array.from(this.activities.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get recent activities (last N)
   */
  getRecent(count: number = 50): BuildActivity[] {
    return this.getAll().slice(-count);
  }

  /**
   * Clear all activities
   */
  clear(): void {
    this.activities.clear();
    this.notify();
  }

  /**
   * Subscribe to activity changes
   */
  subscribe(listener: (activities: BuildActivity[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const activities = this.getAll();
    this.listeners.forEach(listener => listener(activities));
  }
}

/**
 * Create a singleton activity tracker
 */
let globalTracker: ActivityTracker | null = null;

export function getActivityTracker(): ActivityTracker {
  if (!globalTracker) {
    globalTracker = new ActivityTracker();
  }
  return globalTracker;
}

/**
 * Get icon name for activity type (for UI)
 */
export function getActivityIcon(type: ActivityType): string {
  switch (type) {
    case 'thinking': return 'brain';
    case 'file_write': return 'file-plus';
    case 'file_edit': return 'file-edit';
    case 'file_read': return 'file-text';
    case 'command': return 'terminal';
    case 'search': return 'search';
    case 'web_fetch': return 'globe';
    case 'decision': return 'lightbulb';
    case 'error': return 'alert-circle';
    case 'complete': return 'check-circle';
    default: return 'activity';
  }
}

/**
 * Get color class for activity type (for UI)
 */
export function getActivityColor(type: ActivityType): string {
  switch (type) {
    case 'thinking': return 'text-purple-400';
    case 'file_write': return 'text-green-400';
    case 'file_edit': return 'text-yellow-400';
    case 'file_read': return 'text-blue-400';
    case 'command': return 'text-orange-400';
    case 'search': return 'text-cyan-400';
    case 'web_fetch': return 'text-indigo-400';
    case 'decision': return 'text-amber-400';
    case 'error': return 'text-red-400';
    case 'complete': return 'text-emerald-400';
    default: return 'text-gray-400';
  }
}
