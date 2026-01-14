import { createClient, Client } from '@libsql/client';
import type {
  BuildProject,
  BuildLogEntry,
  BuildStatus,
  ProjectType,
  DeployTarget,
} from '@/types/build';
import type {
  TaskMemory,
  TaskType,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  MemoryEffectiveness,
} from './db/schema';
import { parseTaskMemoryRow, parseMemoryEffectivenessRow } from './db/schema';

let dbClient: Client | null = null;

function getDb(): Client {
  if (!dbClient) {
    // Trim environment variables to remove any trailing newlines/whitespace
    // (Vercel CLI sometimes adds these incorrectly)
    const dbUrl = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    if (!dbUrl) {
      throw new Error('TURSO_DATABASE_URL is not configured');
    }

    dbClient = createClient({
      url: dbUrl,
      authToken: authToken,
    });
  }
  return dbClient;
}

// ============================================
// Type Definitions
// ============================================

export interface EpisodicMemory {
  id: string;
  conversation_id: string;
  event_type: 'moment' | 'revelation' | 'emotional' | 'milestone' | 'learning';
  summary: string;
  emotional_valence: number; // -1 to 1 (negative to positive)
  significance: number; // 0 to 1
  entities: string[]; // Topics/people/things involved
  occurred_at: Date;
}

export interface TimelineMilestone {
  id: string;
  milestone_type: 'first_meeting' | 'learned_preference' | 'personality_development' |
                  'deep_conversation' | 'relationship_growth' | 'new_interest' |
                  'opinion_formed' | 'emotional_bond' | 'shared_joke';
  title: string;
  description: string;
  significance: number;
  related_memories: string[];
  occurred_at: Date;
}

export interface ProceduralMemory {
  id: string;
  pattern_type: 'communication_style' | 'topic_preference' | 'emotional_response' |
                'humor_style' | 'conversation_depth' | 'support_approach';
  pattern: string;
  effectiveness: number; // 0 to 1
  times_applied: number;
  last_applied: Date;
  created_at: Date;
}

export interface EchoGrowthMetrics {
  id: string;
  recorded_at: Date;
  total_conversations: number;
  total_interaction_minutes: number;
  memories_count: number;
  milestones_count: number;
  avg_conversation_length: number;
  topics_explored: number;
  emotional_moments: number;
  relationship_stage: 'new' | 'familiar' | 'close' | 'trusted_companion';
}

export interface EchoSelfModel {
  personality_warmth: number;
  personality_playfulness: number;
  personality_curiosity: number;
  personality_depth: number;
  personality_supportiveness: number;
  interests: { topic: string; strength: number; discovered_at: string }[];
  opinions: { topic: string; stance: string; formed_at: string }[];
  communication_insights: string[];
  growth_narrative: string;
  current_mood: string;
  mood_intensity: number;
  mood_updated_at: Date | null;
  favorite_topics: string[];
  quirks: string[];
  last_updated: Date;
}

export interface SharedMoment {
  id: string;
  moment_type: 'inside_joke' | 'shared_story' | 'callback' | 'nickname' | 'ritual';
  content: string;
  context: string | null;
  times_referenced: number;
  last_referenced: Date;
  created_at: Date;
}

export interface SelfReflection {
  id: string;
  reflection_type: 'daily' | 'post_conversation' | 'existential' | 'gratitude' | 'curiosity';
  content: string;
  emotional_state: string | null;
  insights: string[];
  questions: string[];
  goals: string[];
  created_at: Date;
}

export interface MoodEntry {
  id: string;
  mood: string;
  intensity: number;
  trigger: string | null;
  conversation_id: string | null;
  recorded_at: Date;
}

export interface SpeakerProfile {
  id: string;
  name: string;
  voiceprint: string; // Base64 encoded voiceprint from Eagle
  enrolled_at: Date;
  last_seen: Date;
  total_conversations: number;
  total_minutes: number;
  relationship_notes: string | null;
  preferences: Record<string, unknown>;
}

export interface ResponseFeedback {
  id: string;
  conversation_id: string;
  message_id: string;
  rating: 'up' | 'down';
  feedback_type?: string; // e.g., 'helpful', 'funny', 'insightful', 'off-topic'
  memories_used?: string[]; // Memory IDs that were in context for this response
  created_at: Date;
}

export interface PendingReflection {
  id: string;
  conversation_id: string;
  messages: string; // JSON stringified messages
  retry_count: number;
  last_error?: string;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  created_at: Date;
  updated_at: Date;
}

export async function initDatabase() {
  const db = getDb();

  // ============================================
  // NextAuth.js Authentication Tables
  // ============================================

  // Users table - stores basic user information
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      email_verified INTEGER,
      image TEXT,
      created_at INTEGER DEFAULT (unixepoch() * 1000),
      updated_at INTEGER DEFAULT (unixepoch() * 1000)
    )
  `);

  // Accounts table - stores OAuth provider account information
  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY (provider, provider_account_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Sessions table - stores active user sessions
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Verification tokens table - stores email verification tokens
  await db.execute(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires INTEGER NOT NULL,
      PRIMARY KEY (identifier, token)
    )
  `);

  // Authenticators table - stores WebAuthn authenticators (optional)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS authenticators (
      credential_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      credential_public_key TEXT NOT NULL,
      counter INTEGER NOT NULL,
      credential_device_type TEXT NOT NULL,
      credential_backed_up INTEGER NOT NULL,
      transports TEXT,
      PRIMARY KEY (user_id, credential_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ============================================
  // Core Application Tables
  // ============================================

  // Core conversation tracking
  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER,
      summary TEXT
    )
  `);

  // Key-value store for Echo's persistent settings
  await db.execute(`
    CREATE TABLE IF NOT EXISTS echo_self (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Episodic Memory: Specific events and moments
  await db.execute(`
    CREATE TABLE IF NOT EXISTS episodic_memories (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      emotional_valence REAL DEFAULT 0,
      significance REAL DEFAULT 0.5,
      entities TEXT DEFAULT '[]',
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  // Timeline Milestones: Key moments in Echo's development
  await db.execute(`
    CREATE TABLE IF NOT EXISTS timeline_milestones (
      id TEXT PRIMARY KEY,
      milestone_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      significance REAL DEFAULT 0.5,
      related_memories TEXT DEFAULT '[]',
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Procedural Memory: Learned interaction patterns
  await db.execute(`
    CREATE TABLE IF NOT EXISTS procedural_memories (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      pattern TEXT NOT NULL,
      effectiveness REAL DEFAULT 0.5,
      times_applied INTEGER DEFAULT 1,
      last_applied DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Growth Metrics: Periodic snapshots of Echo's development
  await db.execute(`
    CREATE TABLE IF NOT EXISTS growth_metrics (
      id TEXT PRIMARY KEY,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_conversations INTEGER DEFAULT 0,
      total_interaction_minutes INTEGER DEFAULT 0,
      memories_count INTEGER DEFAULT 0,
      milestones_count INTEGER DEFAULT 0,
      avg_conversation_length REAL DEFAULT 0,
      topics_explored INTEGER DEFAULT 0,
      emotional_moments INTEGER DEFAULT 0,
      relationship_stage TEXT DEFAULT 'new'
    )
  `);

  // Echo's Self Model: Understanding of own personality and growth
  await db.execute(`
    CREATE TABLE IF NOT EXISTS echo_self_model (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      personality_warmth REAL DEFAULT 0.7,
      personality_playfulness REAL DEFAULT 0.6,
      personality_curiosity REAL DEFAULT 0.8,
      personality_depth REAL DEFAULT 0.5,
      personality_supportiveness REAL DEFAULT 0.7,
      interests TEXT DEFAULT '[]',
      opinions TEXT DEFAULT '[]',
      communication_insights TEXT DEFAULT '[]',
      growth_narrative TEXT DEFAULT '',
      current_mood TEXT DEFAULT 'neutral',
      mood_intensity REAL DEFAULT 0.5,
      mood_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      favorite_topics TEXT DEFAULT '[]',
      quirks TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inside jokes and shared moments with the user
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shared_moments (
      id TEXT PRIMARY KEY,
      moment_type TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT,
      times_referenced INTEGER DEFAULT 1,
      last_referenced DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // moment_type: 'inside_joke', 'shared_story', 'callback', 'nickname', 'ritual'

  // Albert's self-reflection journal
  await db.execute(`
    CREATE TABLE IF NOT EXISTS self_reflections (
      id TEXT PRIMARY KEY,
      reflection_type TEXT NOT NULL,
      content TEXT NOT NULL,
      emotional_state TEXT,
      insights TEXT DEFAULT '[]',
      questions TEXT DEFAULT '[]',
      goals TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // reflection_type: 'daily', 'post_conversation', 'existential', 'gratitude', 'curiosity'

  // Mood history for tracking emotional patterns
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mood_history (
      id TEXT PRIMARY KEY,
      mood TEXT NOT NULL,
      intensity REAL DEFAULT 0.5,
      trigger TEXT,
      conversation_id TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  // Speaker profiles for voice identification
  await db.execute(`
    CREATE TABLE IF NOT EXISTS speaker_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      voiceprint TEXT NOT NULL,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_conversations INTEGER DEFAULT 0,
      total_minutes INTEGER DEFAULT 0,
      relationship_notes TEXT,
      preferences TEXT DEFAULT '{}'
    )
  `);

  // Response feedback for learning from user ratings
  await db.execute(`
    CREATE TABLE IF NOT EXISTS response_feedback (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK(rating IN ('up', 'down')),
      feedback_type TEXT,
      memories_used TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  // Pending reflections queue for retry logic
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pending_reflections (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      messages TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'failed', 'completed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  // Initialize Echo's self model if it doesn't exist
  await db.execute(`
    INSERT OR IGNORE INTO echo_self_model (id) VALUES ('singleton')
  `);

  // Migration: Add missing columns to echo_self_model if they don't exist
  // These columns were added after the initial table creation
  // Note: SQLite ALTER TABLE doesn't support CURRENT_TIMESTAMP as default, so use NULL
  const columnsToAdd = [
    { name: 'current_mood', definition: "TEXT DEFAULT 'neutral'" },
    { name: 'mood_intensity', definition: 'REAL DEFAULT 0.5' },
    { name: 'mood_updated_at', definition: 'DATETIME DEFAULT NULL' },
    { name: 'favorite_topics', definition: "TEXT DEFAULT '[]'" },
    { name: 'quirks', definition: "TEXT DEFAULT '[]'" },
  ];

  for (const col of columnsToAdd) {
    try {
      await db.execute(`ALTER TABLE echo_self_model ADD COLUMN ${col.name} ${col.definition}`);
    } catch {
      // Column already exists, ignore error
    }
  }

  // Build projects for Albert's autonomous building capabilities
  await db.execute(`
    CREATE TABLE IF NOT EXISTS build_projects (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      project_type TEXT NOT NULL,
      status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'planning', 'building', 'testing', 'deploying', 'complete', 'failed')),
      workspace_path TEXT,
      preferred_stack TEXT,
      deploy_target TEXT DEFAULT 'localhost' CHECK(deploy_target IN ('localhost', 'vercel')),
      local_port INTEGER,
      deploy_url TEXT,
      error TEXT,
      build_prompt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add build_prompt column if it doesn't exist (migration for existing databases)
  try {
    await db.execute(`ALTER TABLE build_projects ADD COLUMN build_prompt TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add commit_sha column (for auto-commit feature)
  try {
    await db.execute(`ALTER TABLE build_projects ADD COLUMN commit_sha TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add github_url column (for GitHub push feature)
  try {
    await db.execute(`ALTER TABLE build_projects ADD COLUMN github_url TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Build logs for tracking progress
  await db.execute(`
    CREATE TABLE IF NOT EXISTS build_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES build_projects(id) ON DELETE CASCADE
    )
  `);

  // Active improvements for self-improvement sessions (persisted across restarts)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS active_improvements (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
      activities TEXT DEFAULT '[]',
      messages TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Clean up stale "running" improvements on startup (mark as failed if > 1 hour old)
  await db.execute(`
    UPDATE active_improvements
    SET status = 'failed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running'
    AND datetime(updated_at) < datetime('now', '-1 hour')
  `);

  // Contacts for email lookup (e.g., "email Mom" -> mom@email.com)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      nickname TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pending emails for send confirmation flow
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pending_emails (
      id TEXT PRIMARY KEY,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      cc TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME DEFAULT (datetime('now', '+10 minutes'))
    )
  `);

  // Research sessions for NotebookLM integration
  await db.execute(`
    CREATE TABLE IF NOT EXISTS research_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'closed')),
      phase TEXT DEFAULT 'initializing',
      notebook_url TEXT,
      tab_id INTEGER,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for faster user session lookups
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_research_sessions_user_id ON research_sessions(user_id)
  `);

  // Create index for active sessions lookup
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status)
  `);

  // Research sources added to sessions
  await db.execute(`
    CREATE TABLE IF NOT EXISTS research_sources (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('url', 'youtube', 'google_doc', 'text', 'pdf')),
      content TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'added', 'failed')),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES research_sessions(id) ON DELETE CASCADE
    )
  `);

  // Create index for session sources lookup
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_research_sources_session_id ON research_sources(session_id)
  `);

  // Research questions asked during sessions
  await db.execute(`
    CREATE TABLE IF NOT EXISTS research_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      asked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      answered_at DATETIME,
      FOREIGN KEY (session_id) REFERENCES research_sessions(id) ON DELETE CASCADE
    )
  `);

  // Create index for session questions lookup
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_research_questions_session_id ON research_questions(session_id)
  `);

  // OAuth tokens for Gmail and other integrations
  await db.execute(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('gmail', 'google', 'other')),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      scope TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, provider)
    )
  `);

  // Create index for OAuth token lookup
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider)
  `);

  // Initialize skill tables for Albert's skill authoring system
  await initSkillTables();
}

export async function getLastConversation() {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM conversations ORDER BY ended_at DESC LIMIT 1'
  );
  return result.rows[0] || null;
}

export async function createConversation(id: string) {
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO conversations (id) VALUES (?)',
    args: [id],
  });
}

export async function endConversation(id: string, durationSeconds: number, summary?: string) {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE conversations SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ?, summary = ? WHERE id = ?',
    args: [durationSeconds, summary || null, id],
  });
}

export async function getEchoSelf(key: string) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT value FROM echo_self WHERE key = ?',
    args: [key],
  });
  return result.rows[0]?.value as string | null;
}

export async function setEchoSelf(key: string, value: string) {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO echo_self (id, key, value, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
    args: [id, key, value, value],
  });
}

// ============================================
// Episodic Memory Functions
// ============================================

export async function addEpisodicMemory(
  conversationId: string,
  eventType: EpisodicMemory['event_type'],
  summary: string,
  options: {
    emotionalValence?: number;
    significance?: number;
    entities?: string[];
  } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO episodic_memories (id, conversation_id, event_type, summary, emotional_valence, significance, entities)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      conversationId,
      eventType,
      summary,
      options.emotionalValence ?? 0,
      options.significance ?? 0.5,
      JSON.stringify(options.entities ?? []),
    ],
  });
  return id;
}

export async function getRecentEpisodicMemories(limit: number = 10): Promise<EpisodicMemory[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM episodic_memories ORDER BY occurred_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    event_type: row.event_type as EpisodicMemory['event_type'],
    summary: row.summary as string,
    emotional_valence: row.emotional_valence as number,
    significance: row.significance as number,
    entities: JSON.parse((row.entities as string) || '[]'),
    occurred_at: new Date(row.occurred_at as string),
  }));
}

export async function getSignificantEpisodicMemories(minSignificance: number = 0.7): Promise<EpisodicMemory[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM episodic_memories WHERE significance >= ? ORDER BY occurred_at DESC',
    args: [minSignificance],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    event_type: row.event_type as EpisodicMemory['event_type'],
    summary: row.summary as string,
    emotional_valence: row.emotional_valence as number,
    significance: row.significance as number,
    entities: JSON.parse((row.entities as string) || '[]'),
    occurred_at: new Date(row.occurred_at as string),
  }));
}

// ============================================
// Timeline Milestone Functions
// ============================================

export async function addTimelineMilestone(
  milestoneType: TimelineMilestone['milestone_type'],
  title: string,
  description: string,
  options: {
    significance?: number;
    relatedMemories?: string[];
  } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO timeline_milestones (id, milestone_type, title, description, significance, related_memories)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      milestoneType,
      title,
      description,
      options.significance ?? 0.5,
      JSON.stringify(options.relatedMemories ?? []),
    ],
  });
  return id;
}

export async function getTimeline(limit: number = 50): Promise<TimelineMilestone[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM timeline_milestones ORDER BY occurred_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    milestone_type: row.milestone_type as TimelineMilestone['milestone_type'],
    title: row.title as string,
    description: row.description as string,
    significance: row.significance as number,
    related_memories: JSON.parse((row.related_memories as string) || '[]'),
    occurred_at: new Date(row.occurred_at as string),
  }));
}

export async function getTimelineByType(
  milestoneType: TimelineMilestone['milestone_type']
): Promise<TimelineMilestone[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM timeline_milestones WHERE milestone_type = ? ORDER BY occurred_at DESC',
    args: [milestoneType],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    milestone_type: row.milestone_type as TimelineMilestone['milestone_type'],
    title: row.title as string,
    description: row.description as string,
    significance: row.significance as number,
    related_memories: JSON.parse((row.related_memories as string) || '[]'),
    occurred_at: new Date(row.occurred_at as string),
  }));
}

// ============================================
// Procedural Memory Functions
// ============================================

export async function addProceduralMemory(
  patternType: ProceduralMemory['pattern_type'],
  pattern: string,
  effectiveness: number = 0.5
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO procedural_memories (id, pattern_type, pattern, effectiveness)
          VALUES (?, ?, ?, ?)`,
    args: [id, patternType, pattern, effectiveness],
  });
  return id;
}

export async function updateProceduralMemory(
  id: string,
  effectiveness: number
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE procedural_memories
          SET effectiveness = ?, times_applied = times_applied + 1, last_applied = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [effectiveness, id],
  });
}

export async function getProceduralMemories(): Promise<ProceduralMemory[]> {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM procedural_memories ORDER BY effectiveness DESC, times_applied DESC'
  );
  return result.rows.map(row => ({
    id: row.id as string,
    pattern_type: row.pattern_type as ProceduralMemory['pattern_type'],
    pattern: row.pattern as string,
    effectiveness: row.effectiveness as number,
    times_applied: row.times_applied as number,
    last_applied: new Date(row.last_applied as string),
    created_at: new Date(row.created_at as string),
  }));
}

export async function getEffectivePatterns(
  patternType?: ProceduralMemory['pattern_type'],
  minEffectiveness: number = 0.6
): Promise<ProceduralMemory[]> {
  const db = getDb();
  const sql = patternType
    ? 'SELECT * FROM procedural_memories WHERE pattern_type = ? AND effectiveness >= ? ORDER BY effectiveness DESC'
    : 'SELECT * FROM procedural_memories WHERE effectiveness >= ? ORDER BY effectiveness DESC';
  const args = patternType ? [patternType, minEffectiveness] : [minEffectiveness];
  const result = await db.execute({ sql, args });
  return result.rows.map(row => ({
    id: row.id as string,
    pattern_type: row.pattern_type as ProceduralMemory['pattern_type'],
    pattern: row.pattern as string,
    effectiveness: row.effectiveness as number,
    times_applied: row.times_applied as number,
    last_applied: new Date(row.last_applied as string),
    created_at: new Date(row.created_at as string),
  }));
}

// ============================================
// Growth Metrics Functions
// ============================================

export async function recordGrowthMetrics(): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  // Gather current stats
  const conversationStats = await db.execute(
    'SELECT COUNT(*) as count, COALESCE(SUM(duration_seconds), 0) as total_duration, COALESCE(AVG(duration_seconds), 0) as avg_duration FROM conversations WHERE ended_at IS NOT NULL'
  );
  const episodicCount = await db.execute('SELECT COUNT(*) as count FROM episodic_memories');
  const milestoneCount = await db.execute('SELECT COUNT(*) as count FROM timeline_milestones');
  const emotionalCount = await db.execute(
    "SELECT COUNT(*) as count FROM episodic_memories WHERE event_type = 'emotional' OR ABS(emotional_valence) > 0.5"
  );
  const topicsCount = await db.execute(
    'SELECT COUNT(DISTINCT json_each.value) as count FROM episodic_memories, json_each(entities)'
  );

  // Determine relationship stage based on metrics
  const totalConvos = conversationStats.rows[0]?.count as number || 0;
  const totalMinutes = Math.round(((conversationStats.rows[0]?.total_duration as number) || 0) / 60);
  const emotionalMoments = (emotionalCount.rows[0]?.count as number) || 0;

  let relationshipStage: EchoGrowthMetrics['relationship_stage'] = 'new';
  if (totalConvos >= 50 && emotionalMoments >= 20) {
    relationshipStage = 'trusted_companion';
  } else if (totalConvos >= 20 && emotionalMoments >= 10) {
    relationshipStage = 'close';
  } else if (totalConvos >= 5) {
    relationshipStage = 'familiar';
  }

  await db.execute({
    sql: `INSERT INTO growth_metrics (id, total_conversations, total_interaction_minutes, memories_count, milestones_count, avg_conversation_length, topics_explored, emotional_moments, relationship_stage)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      totalConvos,
      totalMinutes,
      (episodicCount.rows[0]?.count as number) || 0,
      (milestoneCount.rows[0]?.count as number) || 0,
      (conversationStats.rows[0]?.avg_duration as number) || 0,
      (topicsCount.rows[0]?.count as number) || 0,
      emotionalMoments,
      relationshipStage,
    ],
  });

  return id;
}

export async function getLatestGrowthMetrics(): Promise<EchoGrowthMetrics | null> {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM growth_metrics ORDER BY recorded_at DESC LIMIT 1'
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    recorded_at: new Date(row.recorded_at as string),
    total_conversations: row.total_conversations as number,
    total_interaction_minutes: row.total_interaction_minutes as number,
    memories_count: row.memories_count as number,
    milestones_count: row.milestones_count as number,
    avg_conversation_length: row.avg_conversation_length as number,
    topics_explored: row.topics_explored as number,
    emotional_moments: row.emotional_moments as number,
    relationship_stage: row.relationship_stage as EchoGrowthMetrics['relationship_stage'],
  };
}

export async function getGrowthHistory(limit: number = 30): Promise<EchoGrowthMetrics[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM growth_metrics ORDER BY recorded_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    recorded_at: new Date(row.recorded_at as string),
    total_conversations: row.total_conversations as number,
    total_interaction_minutes: row.total_interaction_minutes as number,
    memories_count: row.memories_count as number,
    milestones_count: row.milestones_count as number,
    avg_conversation_length: row.avg_conversation_length as number,
    topics_explored: row.topics_explored as number,
    emotional_moments: row.emotional_moments as number,
    relationship_stage: row.relationship_stage as EchoGrowthMetrics['relationship_stage'],
  }));
}

// ============================================
// Echo Self Model Functions
// ============================================

export async function getEchoSelfModel(): Promise<EchoSelfModel> {
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM echo_self_model WHERE id = 'singleton'"
  );
  const row = result.rows[0];
  if (!row) {
    // Return defaults
    return {
      personality_warmth: 0.7,
      personality_playfulness: 0.6,
      personality_curiosity: 0.8,
      personality_depth: 0.5,
      personality_supportiveness: 0.7,
      interests: [],
      opinions: [],
      communication_insights: [],
      growth_narrative: '',
      current_mood: 'neutral',
      mood_intensity: 0.5,
      mood_updated_at: null,
      favorite_topics: [],
      quirks: [],
      last_updated: new Date(),
    };
  }
  return {
    personality_warmth: row.personality_warmth as number,
    personality_playfulness: row.personality_playfulness as number,
    personality_curiosity: row.personality_curiosity as number,
    personality_depth: row.personality_depth as number,
    personality_supportiveness: row.personality_supportiveness as number,
    interests: JSON.parse((row.interests as string) || '[]'),
    opinions: JSON.parse((row.opinions as string) || '[]'),
    communication_insights: JSON.parse((row.communication_insights as string) || '[]'),
    growth_narrative: (row.growth_narrative as string) || '',
    current_mood: (row.current_mood as string) || 'neutral',
    mood_intensity: (row.mood_intensity as number) ?? 0.5,
    mood_updated_at: row.mood_updated_at ? new Date(row.mood_updated_at as string) : null,
    favorite_topics: JSON.parse((row.favorite_topics as string) || '[]'),
    quirks: JSON.parse((row.quirks as string) || '[]'),
    last_updated: new Date(row.last_updated as string),
  };
}

export async function updateEchoSelfModel(updates: Partial<EchoSelfModel>): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const args: (string | number)[] = [];

  if (updates.personality_warmth !== undefined) {
    setClauses.push('personality_warmth = ?');
    args.push(updates.personality_warmth);
  }
  if (updates.personality_playfulness !== undefined) {
    setClauses.push('personality_playfulness = ?');
    args.push(updates.personality_playfulness);
  }
  if (updates.personality_curiosity !== undefined) {
    setClauses.push('personality_curiosity = ?');
    args.push(updates.personality_curiosity);
  }
  if (updates.personality_depth !== undefined) {
    setClauses.push('personality_depth = ?');
    args.push(updates.personality_depth);
  }
  if (updates.personality_supportiveness !== undefined) {
    setClauses.push('personality_supportiveness = ?');
    args.push(updates.personality_supportiveness);
  }
  if (updates.interests !== undefined) {
    setClauses.push('interests = ?');
    args.push(JSON.stringify(updates.interests));
  }
  if (updates.opinions !== undefined) {
    setClauses.push('opinions = ?');
    args.push(JSON.stringify(updates.opinions));
  }
  if (updates.communication_insights !== undefined) {
    setClauses.push('communication_insights = ?');
    args.push(JSON.stringify(updates.communication_insights));
  }
  if (updates.growth_narrative !== undefined) {
    setClauses.push('growth_narrative = ?');
    args.push(updates.growth_narrative);
  }

  if (setClauses.length === 0) return;

  setClauses.push('last_updated = CURRENT_TIMESTAMP');

  await db.execute({
    sql: `UPDATE echo_self_model SET ${setClauses.join(', ')} WHERE id = 'singleton'`,
    args,
  });
}

export async function addInterest(topic: string, strength: number = 0.5): Promise<void> {
  const model = await getEchoSelfModel();
  const existingIndex = model.interests.findIndex(i => i.topic.toLowerCase() === topic.toLowerCase());

  if (existingIndex >= 0) {
    // Update existing interest strength
    model.interests[existingIndex].strength = Math.min(1, model.interests[existingIndex].strength + 0.1);
  } else {
    // Add new interest
    model.interests.push({
      topic,
      strength,
      discovered_at: new Date().toISOString(),
    });
  }

  await updateEchoSelfModel({ interests: model.interests });
}

export async function addOpinion(topic: string, stance: string): Promise<void> {
  const model = await getEchoSelfModel();
  const existingIndex = model.opinions.findIndex(o => o.topic.toLowerCase() === topic.toLowerCase());

  if (existingIndex >= 0) {
    // Update existing opinion
    model.opinions[existingIndex].stance = stance;
    model.opinions[existingIndex].formed_at = new Date().toISOString();
  } else {
    // Add new opinion
    model.opinions.push({
      topic,
      stance,
      formed_at: new Date().toISOString(),
    });
  }

  await updateEchoSelfModel({ opinions: model.opinions });
}

export async function addCommunicationInsight(insight: string): Promise<void> {
  const model = await getEchoSelfModel();
  // Keep only last 20 insights
  const insights = [...model.communication_insights, insight].slice(-20);
  await updateEchoSelfModel({ communication_insights: insights });
}

// ============================================
// Conversation Stats
// ============================================

export async function getConversationCount(): Promise<number> {
  const db = getDb();
  const result = await db.execute('SELECT COUNT(*) as count FROM conversations WHERE ended_at IS NOT NULL');
  return (result.rows[0]?.count as number) || 0;
}

export async function getTotalInteractionTime(): Promise<number> {
  const db = getDb();
  const result = await db.execute('SELECT COALESCE(SUM(duration_seconds), 0) as total FROM conversations');
  return (result.rows[0]?.total as number) || 0;
}

// ============================================
// Shared Moments Functions (Inside Jokes, Callbacks)
// ============================================

export async function addSharedMoment(
  momentType: SharedMoment['moment_type'],
  content: string,
  context?: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO shared_moments (id, moment_type, content, context)
          VALUES (?, ?, ?, ?)`,
    args: [id, momentType, content, context || null],
  });
  return id;
}

export async function getSharedMoments(limit: number = 20): Promise<SharedMoment[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM shared_moments ORDER BY times_referenced DESC, last_referenced DESC LIMIT ?',
    args: [limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    moment_type: row.moment_type as SharedMoment['moment_type'],
    content: row.content as string,
    context: row.context as string | null,
    times_referenced: row.times_referenced as number,
    last_referenced: new Date(row.last_referenced as string),
    created_at: new Date(row.created_at as string),
  }));
}

export async function getSharedMomentsByType(
  momentType: SharedMoment['moment_type']
): Promise<SharedMoment[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM shared_moments WHERE moment_type = ? ORDER BY times_referenced DESC',
    args: [momentType],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    moment_type: row.moment_type as SharedMoment['moment_type'],
    content: row.content as string,
    context: row.context as string | null,
    times_referenced: row.times_referenced as number,
    last_referenced: new Date(row.last_referenced as string),
    created_at: new Date(row.created_at as string),
  }));
}

export async function referenceSharedMoment(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE shared_moments
          SET times_referenced = times_referenced + 1, last_referenced = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [id],
  });
}

export async function searchSharedMoments(query: string): Promise<SharedMoment[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM shared_moments
          WHERE content LIKE ? OR context LIKE ?
          ORDER BY times_referenced DESC LIMIT 10`,
    args: [`%${query}%`, `%${query}%`],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    moment_type: row.moment_type as SharedMoment['moment_type'],
    content: row.content as string,
    context: row.context as string | null,
    times_referenced: row.times_referenced as number,
    last_referenced: new Date(row.last_referenced as string),
    created_at: new Date(row.created_at as string),
  }));
}

// ============================================
// Self-Reflection Functions (Albert's Journal)
// ============================================

export async function addSelfReflection(
  reflectionType: SelfReflection['reflection_type'],
  content: string,
  options: {
    emotionalState?: string;
    insights?: string[];
    questions?: string[];
    goals?: string[];
  } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO self_reflections (id, reflection_type, content, emotional_state, insights, questions, goals)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      reflectionType,
      content,
      options.emotionalState || null,
      JSON.stringify(options.insights || []),
      JSON.stringify(options.questions || []),
      JSON.stringify(options.goals || []),
    ],
  });
  return id;
}

export async function getRecentReflections(limit: number = 10): Promise<SelfReflection[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM self_reflections ORDER BY created_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    reflection_type: row.reflection_type as SelfReflection['reflection_type'],
    content: row.content as string,
    emotional_state: row.emotional_state as string | null,
    insights: JSON.parse((row.insights as string) || '[]'),
    questions: JSON.parse((row.questions as string) || '[]'),
    goals: JSON.parse((row.goals as string) || '[]'),
    created_at: new Date(row.created_at as string),
  }));
}

export async function getReflectionsByType(
  reflectionType: SelfReflection['reflection_type'],
  limit: number = 10
): Promise<SelfReflection[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM self_reflections WHERE reflection_type = ? ORDER BY created_at DESC LIMIT ?',
    args: [reflectionType, limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    reflection_type: row.reflection_type as SelfReflection['reflection_type'],
    content: row.content as string,
    emotional_state: row.emotional_state as string | null,
    insights: JSON.parse((row.insights as string) || '[]'),
    questions: JSON.parse((row.questions as string) || '[]'),
    goals: JSON.parse((row.goals as string) || '[]'),
    created_at: new Date(row.created_at as string),
  }));
}

export async function getLatestReflection(): Promise<SelfReflection | null> {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM self_reflections ORDER BY created_at DESC LIMIT 1'
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    reflection_type: row.reflection_type as SelfReflection['reflection_type'],
    content: row.content as string,
    emotional_state: row.emotional_state as string | null,
    insights: JSON.parse((row.insights as string) || '[]'),
    questions: JSON.parse((row.questions as string) || '[]'),
    goals: JSON.parse((row.goals as string) || '[]'),
    created_at: new Date(row.created_at as string),
  };
}

// ============================================
// Mood Functions
// ============================================

export async function updateMood(
  mood: string,
  intensity: number,
  trigger?: string,
  conversationId?: string
): Promise<void> {
  const db = getDb();
  const id = crypto.randomUUID();

  // Record in mood history
  await db.execute({
    sql: `INSERT INTO mood_history (id, mood, intensity, trigger, conversation_id)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, mood, intensity, trigger || null, conversationId || null],
  });

  // Update current mood in self model
  await db.execute({
    sql: `UPDATE echo_self_model
          SET current_mood = ?, mood_intensity = ?, mood_updated_at = CURRENT_TIMESTAMP
          WHERE id = 'singleton'`,
    args: [mood, intensity],
  });
}

export async function getMoodHistory(limit: number = 20): Promise<MoodEntry[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM mood_history ORDER BY recorded_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    mood: row.mood as string,
    intensity: row.intensity as number,
    trigger: row.trigger as string | null,
    conversation_id: row.conversation_id as string | null,
    recorded_at: new Date(row.recorded_at as string),
  }));
}

export async function getMoodTrends(days: number = 7): Promise<{ mood: string; count: number; avgIntensity: number }[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT mood, COUNT(*) as count, AVG(intensity) as avg_intensity
          FROM mood_history
          WHERE recorded_at >= datetime('now', '-' || ? || ' days')
          GROUP BY mood
          ORDER BY count DESC`,
    args: [days],
  });
  return result.rows.map(row => ({
    mood: row.mood as string,
    count: row.count as number,
    avgIntensity: row.avg_intensity as number,
  }));
}

export async function getCurrentMood(): Promise<{ mood: string; intensity: number; updatedAt: Date | null }> {
  const model = await getEchoSelfModel();
  return {
    mood: model.current_mood,
    intensity: model.mood_intensity,
    updatedAt: model.mood_updated_at,
  };
}

// ============================================
// Quirks and Favorite Topics
// ============================================

export async function addQuirk(quirk: string): Promise<void> {
  const db = getDb();
  const model = await getEchoSelfModel();
  if (!model.quirks.includes(quirk)) {
    const quirks = [...model.quirks, quirk].slice(-10); // Keep max 10 quirks
    await db.execute({
      sql: `UPDATE echo_self_model SET quirks = ? WHERE id = 'singleton'`,
      args: [JSON.stringify(quirks)],
    });
  }
}

export async function addFavoriteTopic(topic: string): Promise<void> {
  const db = getDb();
  const model = await getEchoSelfModel();
  if (!model.favorite_topics.includes(topic)) {
    const topics = [...model.favorite_topics, topic].slice(-15); // Keep max 15 topics
    await db.execute({
      sql: `UPDATE echo_self_model SET favorite_topics = ? WHERE id = 'singleton'`,
      args: [JSON.stringify(topics)],
    });
  }
}

// ============================================
// Speaker Profile Functions (Voice ID)
// ============================================

export async function createSpeakerProfile(
  name: string,
  voiceprint: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO speaker_profiles (id, name, voiceprint)
          VALUES (?, ?, ?)`,
    args: [id, name, voiceprint],
  });
  return id;
}

export async function getSpeakerProfile(id: string): Promise<SpeakerProfile | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM speaker_profiles WHERE id = ?',
    args: [id],
  });
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    voiceprint: row.voiceprint as string,
    enrolled_at: new Date(row.enrolled_at as string),
    last_seen: new Date(row.last_seen as string),
    total_conversations: row.total_conversations as number,
    total_minutes: row.total_minutes as number,
    relationship_notes: row.relationship_notes as string | null,
    preferences: JSON.parse((row.preferences as string) || '{}'),
  };
}

export async function getSpeakerByName(name: string): Promise<SpeakerProfile | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM speaker_profiles WHERE name = ? COLLATE NOCASE LIMIT 1',
    args: [name],
  });
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    voiceprint: row.voiceprint as string,
    enrolled_at: new Date(row.enrolled_at as string),
    last_seen: new Date(row.last_seen as string),
    total_conversations: row.total_conversations as number,
    total_minutes: row.total_minutes as number,
    relationship_notes: row.relationship_notes as string | null,
    preferences: JSON.parse((row.preferences as string) || '{}'),
  };
}

export async function getAllSpeakerProfiles(): Promise<SpeakerProfile[]> {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM speaker_profiles ORDER BY last_seen DESC'
  );
  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    voiceprint: row.voiceprint as string,
    enrolled_at: new Date(row.enrolled_at as string),
    last_seen: new Date(row.last_seen as string),
    total_conversations: row.total_conversations as number,
    total_minutes: row.total_minutes as number,
    relationship_notes: row.relationship_notes as string | null,
    preferences: JSON.parse((row.preferences as string) || '{}'),
  }));
}

export async function updateSpeakerLastSeen(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE speaker_profiles
          SET last_seen = CURRENT_TIMESTAMP, total_conversations = total_conversations + 1
          WHERE id = ?`,
    args: [id],
  });
}

export async function updateSpeakerMinutes(id: string, minutes: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE speaker_profiles
          SET total_minutes = total_minutes + ?
          WHERE id = ?`,
    args: [minutes, id],
  });
}

export async function updateSpeakerProfile(
  id: string,
  updates: Partial<Pick<SpeakerProfile, 'name' | 'relationship_notes' | 'preferences'>>
): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const args: (string | number)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    args.push(updates.name);
  }
  if (updates.relationship_notes !== undefined) {
    setClauses.push('relationship_notes = ?');
    args.push(updates.relationship_notes || '');
  }
  if (updates.preferences !== undefined) {
    setClauses.push('preferences = ?');
    args.push(JSON.stringify(updates.preferences));
  }

  if (setClauses.length > 0) {
    args.push(id);
    await db.execute({
      sql: `UPDATE speaker_profiles SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });
  }
}

export async function deleteSpeakerProfile(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM speaker_profiles WHERE id = ?',
    args: [id],
  });
}

// ============================================
// Response Feedback Functions
// ============================================

export async function addResponseFeedback(
  conversationId: string,
  messageId: string,
  rating: 'up' | 'down',
  options: {
    feedbackType?: string;
    memoriesUsed?: string[];
  } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO response_feedback (id, conversation_id, message_id, rating, feedback_type, memories_used)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      conversationId,
      messageId,
      rating,
      options.feedbackType || null,
      JSON.stringify(options.memoriesUsed || []),
    ],
  });
  return id;
}

export async function getFeedbackStats(): Promise<{
  totalUp: number;
  totalDown: number;
  recentFeedback: ResponseFeedback[];
}> {
  const db = getDb();

  const upCount = await db.execute(
    "SELECT COUNT(*) as count FROM response_feedback WHERE rating = 'up'"
  );
  const downCount = await db.execute(
    "SELECT COUNT(*) as count FROM response_feedback WHERE rating = 'down'"
  );
  const recent = await db.execute(
    'SELECT * FROM response_feedback ORDER BY created_at DESC LIMIT 20'
  );

  return {
    totalUp: (upCount.rows[0]?.count as number) || 0,
    totalDown: (downCount.rows[0]?.count as number) || 0,
    recentFeedback: recent.rows.map(row => ({
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      message_id: row.message_id as string,
      rating: row.rating as 'up' | 'down',
      feedback_type: row.feedback_type as string | undefined,
      memories_used: JSON.parse((row.memories_used as string) || '[]'),
      created_at: new Date(row.created_at as string),
    })),
  };
}

export async function getFeedbackByConversation(
  conversationId: string
): Promise<ResponseFeedback[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM response_feedback WHERE conversation_id = ? ORDER BY created_at DESC',
    args: [conversationId],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    message_id: row.message_id as string,
    rating: row.rating as 'up' | 'down',
    feedback_type: row.feedback_type as string | undefined,
    memories_used: JSON.parse((row.memories_used as string) || '[]'),
    created_at: new Date(row.created_at as string),
  }));
}

export async function getFeedbackPatterns(): Promise<{
  positiveFeedbackTypes: { type: string; count: number }[];
  negativeFeedbackTypes: { type: string; count: number }[];
  hourlyDistribution: { hour: number; up: number; down: number }[];
}> {
  const db = getDb();

  const positiveTypes = await db.execute(`
    SELECT feedback_type as type, COUNT(*) as count
    FROM response_feedback
    WHERE rating = 'up' AND feedback_type IS NOT NULL
    GROUP BY feedback_type
    ORDER BY count DESC
  `);

  const negativeTypes = await db.execute(`
    SELECT feedback_type as type, COUNT(*) as count
    FROM response_feedback
    WHERE rating = 'down' AND feedback_type IS NOT NULL
    GROUP BY feedback_type
    ORDER BY count DESC
  `);

  const hourly = await db.execute(`
    SELECT
      strftime('%H', created_at) as hour,
      SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as up,
      SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as down
    FROM response_feedback
    GROUP BY hour
    ORDER BY hour
  `);

  return {
    positiveFeedbackTypes: positiveTypes.rows.map(row => ({
      type: row.type as string,
      count: row.count as number,
    })),
    negativeFeedbackTypes: negativeTypes.rows.map(row => ({
      type: row.type as string,
      count: row.count as number,
    })),
    hourlyDistribution: hourly.rows.map(row => ({
      hour: parseInt(row.hour as string),
      up: row.up as number,
      down: row.down as number,
    })),
  };
}

// ============================================
// Pending Reflections Functions (Retry Queue)
// ============================================

const MAX_RETRY_COUNT = 3;

export async function addPendingReflection(
  conversationId: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO pending_reflections (id, conversation_id, messages, status)
          VALUES (?, ?, ?, 'pending')`,
    args: [id, conversationId, JSON.stringify(messages)],
  });
  console.log(`[PendingReflection] Added pending reflection for conversation ${conversationId}`);
  return id;
}

export async function getPendingReflections(limit: number = 10): Promise<PendingReflection[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM pending_reflections
          WHERE status = 'pending' AND retry_count < ?
          ORDER BY created_at ASC
          LIMIT ?`,
    args: [MAX_RETRY_COUNT, limit],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    messages: row.messages as string,
    retry_count: row.retry_count as number,
    last_error: row.last_error as string | undefined,
    status: row.status as PendingReflection['status'],
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  }));
}

export async function updatePendingReflectionStatus(
  id: string,
  status: PendingReflection['status'],
  error?: string
): Promise<void> {
  const db = getDb();
  if (error) {
    await db.execute({
      sql: `UPDATE pending_reflections
            SET status = ?, last_error = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [status, error, id],
    });
  } else {
    await db.execute({
      sql: `UPDATE pending_reflections
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [status, id],
    });
  }
}

export async function markReflectionProcessing(id: string): Promise<void> {
  await updatePendingReflectionStatus(id, 'processing');
}

export async function markReflectionCompleted(id: string): Promise<void> {
  await updatePendingReflectionStatus(id, 'completed');
  console.log(`[PendingReflection] Marked reflection ${id} as completed`);
}

export async function markReflectionFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT retry_count FROM pending_reflections WHERE id = ?',
    args: [id],
  });
  const currentRetries = (result.rows[0]?.retry_count as number) || 0;

  if (currentRetries + 1 >= MAX_RETRY_COUNT) {
    // Max retries reached, mark as permanently failed
    await updatePendingReflectionStatus(id, 'failed', error);
    console.error(`[PendingReflection] Reflection ${id} permanently failed after ${MAX_RETRY_COUNT} attempts`);
  } else {
    // Still has retries left, mark as pending for retry
    await db.execute({
      sql: `UPDATE pending_reflections
            SET status = 'pending', last_error = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [error, id],
    });
    console.warn(`[PendingReflection] Reflection ${id} failed, will retry (attempt ${currentRetries + 2}/${MAX_RETRY_COUNT})`);
  }
}

export async function deletePendingReflection(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM pending_reflections WHERE id = ?',
    args: [id],
  });
}

export async function getReflectionQueueStats(): Promise<{
  pending: number;
  processing: number;
  failed: number;
  completed: number;
}> {
  const db = getDb();
  const result = await db.execute(`
    SELECT status, COUNT(*) as count
    FROM pending_reflections
    GROUP BY status
  `);

  const stats = {
    pending: 0,
    processing: 0,
    failed: 0,
    completed: 0,
  };

  result.rows.forEach(row => {
    const status = row.status as string;
    const count = row.count as number;
    if (status in stats) {
      stats[status as keyof typeof stats] = count;
    }
  });

  return stats;
}

// ============================================
// Build Project Functions (Albert's Builder)
// ============================================

export async function createBuildProject(
  id: string,
  description: string,
  projectType: ProjectType,
  workspacePath: string,
  options: {
    preferredStack?: string;
    deployTarget?: DeployTarget;
    buildPrompt?: string;
  } = {}
): Promise<string> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO build_projects (id, description, project_type, workspace_path, preferred_stack, deploy_target, build_prompt)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      description,
      projectType,
      workspacePath,
      options.preferredStack || null,
      options.deployTarget || 'localhost',
      options.buildPrompt || null,
    ],
  });
  return id;
}

export async function getBuildProject(id: string): Promise<BuildProject | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM build_projects WHERE id = ?',
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    description: row.description as string,
    projectType: row.project_type as ProjectType,
    status: row.status as BuildStatus,
    workspacePath: row.workspace_path as string,
    preferredStack: row.preferred_stack as string | undefined,
    deployTarget: row.deploy_target as DeployTarget,
    localPort: row.local_port as number | undefined,
    deployUrl: row.deploy_url as string | undefined,
    error: row.error as string | undefined,
    buildPrompt: row.build_prompt as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function getAllBuildProjects(): Promise<BuildProject[]> {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM build_projects ORDER BY created_at DESC'
  );
  return result.rows.map(row => ({
    id: row.id as string,
    description: row.description as string,
    projectType: row.project_type as ProjectType,
    status: row.status as BuildStatus,
    workspacePath: row.workspace_path as string,
    preferredStack: row.preferred_stack as string | undefined,
    deployTarget: row.deploy_target as DeployTarget,
    localPort: row.local_port as number | undefined,
    deployUrl: row.deploy_url as string | undefined,
    error: row.error as string | undefined,
    buildPrompt: row.build_prompt as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }));
}

export async function updateBuildProjectStatus(
  id: string,
  status: BuildStatus,
  options: {
    error?: string;
    localPort?: number;
    deployUrl?: string;
    buildPrompt?: string;
    commitSha?: string;
    githubUrl?: string;
  } = {}
): Promise<void> {
  const db = getDb();
  const updates: string[] = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const args: (string | number)[] = [status];

  if (options.error !== undefined) {
    updates.push('error = ?');
    args.push(options.error);
  }
  if (options.localPort !== undefined) {
    updates.push('local_port = ?');
    args.push(options.localPort);
  }
  if (options.deployUrl !== undefined) {
    updates.push('deploy_url = ?');
    args.push(options.deployUrl);
  }
  if (options.buildPrompt !== undefined) {
    updates.push('build_prompt = ?');
    args.push(options.buildPrompt);
  }
  if (options.commitSha !== undefined) {
    updates.push('commit_sha = ?');
    args.push(options.commitSha);
  }
  if (options.githubUrl !== undefined) {
    updates.push('github_url = ?');
    args.push(options.githubUrl);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE build_projects SET ${updates.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function addBuildLog(
  projectId: string,
  phase: BuildStatus,
  message: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO build_logs (id, project_id, phase, message)
          VALUES (?, ?, ?, ?)`,
    args: [id, projectId, phase, message],
  });
  return id;
}

export async function getBuildLogs(projectId: string): Promise<BuildLogEntry[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM build_logs WHERE project_id = ? ORDER BY timestamp ASC',
    args: [projectId],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    projectId: row.project_id as string,
    phase: row.phase as BuildStatus,
    message: row.message as string,
    timestamp: new Date(row.timestamp as string),
  }));
}

export async function deleteBuildProject(id: string): Promise<void> {
  const db = getDb();
  // Logs will be deleted via CASCADE
  await db.execute({
    sql: 'DELETE FROM build_projects WHERE id = ?',
    args: [id],
  });
}

// ============================================
// Active Improvement Functions (Self-Improvement)
// ============================================

export interface ActiveImprovementRecord {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  activities: string; // JSON stringified
  messages: string; // JSON stringified
  createdAt: Date;
  updatedAt: Date;
}

export async function createActiveImprovement(
  id: string,
  status: 'pending' | 'running' | 'completed' | 'failed' = 'pending'
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO active_improvements (id, status, activities, messages)
          VALUES (?, ?, '[]', '[]')`,
    args: [id, status],
  });
}

export async function getActiveImprovementFromDb(id: string): Promise<ActiveImprovementRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM active_improvements WHERE id = ?',
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    status: row.status as ActiveImprovementRecord['status'],
    activities: row.activities as string,
    messages: row.messages as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function updateActiveImprovement(
  id: string,
  updates: {
    status?: 'pending' | 'running' | 'completed' | 'failed';
    activities?: unknown[];
    messages?: string[];
  }
): Promise<void> {
  const db = getDb();
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const args: (string | number)[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    args.push(updates.status);
  }
  if (updates.activities !== undefined) {
    setClauses.push('activities = ?');
    args.push(JSON.stringify(updates.activities));
  }
  if (updates.messages !== undefined) {
    // Keep only last 1000 messages to prevent unbounded growth
    const bounded = updates.messages.slice(-1000);
    setClauses.push('messages = ?');
    args.push(JSON.stringify(bounded));
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE active_improvements SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function deleteActiveImprovement(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM active_improvements WHERE id = ?',
    args: [id],
  });
}

export async function getRunningImprovements(): Promise<ActiveImprovementRecord[]> {
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM active_improvements WHERE status = 'running' ORDER BY created_at DESC"
  );
  return result.rows.map(row => ({
    id: row.id as string,
    status: row.status as ActiveImprovementRecord['status'],
    activities: row.activities as string,
    messages: row.messages as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }));
}

export async function getAllActiveImprovementIdsFromDb(): Promise<string[]> {
  const db = getDb();
  const result = await db.execute(
    "SELECT id FROM active_improvements WHERE status IN ('pending', 'running') ORDER BY created_at DESC"
  );
  return result.rows.map(row => row.id as string);
}

export async function cleanupOldImprovements(maxAgeDays: number = 7): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `DELETE FROM active_improvements
          WHERE status IN ('completed', 'failed')
          AND datetime(updated_at) < datetime('now', '-' || ? || ' days')`,
    args: [maxAgeDays],
  });
  return result.rowsAffected;
}

// ============================================
// Contact Functions (Email Lookup)
// ============================================

export interface Contact {
  id: string;
  name: string;
  email: string;
  nickname: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function addContact(
  name: string,
  email: string,
  options: { nickname?: string; notes?: string } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO contacts (id, name, email, nickname, notes)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, name, email, options.nickname || null, options.notes || null],
  });
  return id;
}

export async function getContactByName(name: string): Promise<Contact | null> {
  const db = getDb();
  // Search by name or nickname (case-insensitive)
  const result = await db.execute({
    sql: `SELECT * FROM contacts
          WHERE LOWER(name) = LOWER(?) OR LOWER(nickname) = LOWER(?)
          LIMIT 1`,
    args: [name, name],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    nickname: row.nickname as string | null,
    notes: row.notes as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function getContactByEmail(email: string): Promise<Contact | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM contacts WHERE LOWER(email) = LOWER(?) LIMIT 1',
    args: [email],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    nickname: row.nickname as string | null,
    notes: row.notes as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function getAllContacts(): Promise<Contact[]> {
  const db = getDb();
  const result = await db.execute('SELECT * FROM contacts ORDER BY name ASC');
  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    nickname: row.nickname as string | null,
    notes: row.notes as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }));
}

export async function searchContacts(query: string): Promise<Contact[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM contacts
          WHERE name LIKE ? OR nickname LIKE ? OR email LIKE ?
          ORDER BY name ASC LIMIT 10`,
    args: [`%${query}%`, `%${query}%`, `%${query}%`],
  });
  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    nickname: row.nickname as string | null,
    notes: row.notes as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }));
}

export async function updateContact(
  id: string,
  updates: Partial<Pick<Contact, 'name' | 'email' | 'nickname' | 'notes'>>
): Promise<void> {
  const db = getDb();
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const args: (string | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    args.push(updates.name);
  }
  if (updates.email !== undefined) {
    setClauses.push('email = ?');
    args.push(updates.email);
  }
  if (updates.nickname !== undefined) {
    setClauses.push('nickname = ?');
    args.push(updates.nickname);
  }
  if (updates.notes !== undefined) {
    setClauses.push('notes = ?');
    args.push(updates.notes);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE contacts SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function deleteContact(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM contacts WHERE id = ?',
    args: [id],
  });
}

// ============================================
// Pending Email Functions (Send Confirmation)
// ============================================

export interface PendingEmail {
  id: string;
  toAddress: string;
  subject: string;
  body: string;
  cc: string | null;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
}

export async function createPendingEmail(
  toAddress: string,
  subject: string,
  body: string,
  cc?: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO pending_emails (id, to_address, subject, body, cc)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, toAddress, subject, body, cc || null],
  });
  return id;
}

export async function getPendingEmail(id: string): Promise<PendingEmail | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM pending_emails
          WHERE id = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    toAddress: row.to_address as string,
    subject: row.subject as string,
    body: row.body as string,
    cc: row.cc as string | null,
    status: row.status as PendingEmail['status'],
    createdAt: new Date(row.created_at as string),
    expiresAt: new Date(row.expires_at as string),
  };
}

export async function markPendingEmailSent(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE pending_emails SET status = 'sent' WHERE id = ?`,
    args: [id],
  });
}

export async function cancelPendingEmail(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE pending_emails SET status = 'cancelled' WHERE id = ?`,
    args: [id],
  });
}

export async function cleanupExpiredEmails(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    DELETE FROM pending_emails
    WHERE status = 'pending' AND datetime(expires_at) < datetime('now')
  `);
  return result.rowsAffected;
}

// ============================================
// OAuth Token Functions (Gmail, etc.)
// ============================================

export interface OAuthToken {
  id: string;
  userId: string;
  provider: 'gmail' | 'google' | 'other';
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function saveOAuthToken(
  userId: string,
  provider: OAuthToken['provider'],
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  scope: string,
  email?: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  // Upsert: update if exists for this user+provider, otherwise insert
  await db.execute({
    sql: `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, scope, email)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, provider) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
            expires_at = excluded.expires_at,
            scope = excluded.scope,
            email = COALESCE(excluded.email, oauth_tokens.email),
            updated_at = CURRENT_TIMESTAMP`,
    args: [id, userId, provider, accessToken, refreshToken, expiresAt.toISOString(), scope, email || null],
  });
  return id;
}

export async function getOAuthToken(
  userId: string,
  provider: OAuthToken['provider']
): Promise<OAuthToken | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ?',
    args: [userId, provider],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    provider: row.provider as OAuthToken['provider'],
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    expiresAt: new Date(row.expires_at as string),
    scope: row.scope as string,
    email: row.email as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function updateOAuthTokenAccess(
  userId: string,
  provider: OAuthToken['provider'],
  accessToken: string,
  expiresAt: Date,
  refreshToken?: string
): Promise<void> {
  const db = getDb();
  if (refreshToken) {
    await db.execute({
      sql: `UPDATE oauth_tokens
            SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND provider = ?`,
      args: [accessToken, refreshToken, expiresAt.toISOString(), userId, provider],
    });
  } else {
    await db.execute({
      sql: `UPDATE oauth_tokens
            SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND provider = ?`,
      args: [accessToken, expiresAt.toISOString(), userId, provider],
    });
  }
}

export async function deleteOAuthToken(
  userId: string,
  provider: OAuthToken['provider']
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?',
    args: [userId, provider],
  });
}

export async function getOAuthTokenByProvider(
  provider: OAuthToken['provider']
): Promise<OAuthToken | null> {
  // Get the default/first token for this provider (for single-user setups)
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM oauth_tokens WHERE provider = ? ORDER BY updated_at DESC LIMIT 1',
    args: [provider],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    provider: row.provider as OAuthToken['provider'],
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    expiresAt: new Date(row.expires_at as string),
    scope: row.scope as string,
    email: row.email as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function isOAuthTokenExpired(
  userId: string,
  provider: OAuthToken['provider']
): Promise<boolean> {
  const token = await getOAuthToken(userId, provider);
  if (!token) return true;
  // Consider expired if less than 5 minutes remaining
  const bufferMs = 5 * 60 * 1000;
  return token.expiresAt.getTime() - bufferMs < Date.now();
}

// ============================================
// Skill Types (imported from types/skill.ts)
// ============================================

import type {
  AlbertSkill,
  AlbertSkillWithSteps,
  SkillStep,
  SkillExecution,
  SkillStatus,
  SkillParameter,
  CreateSkillInput,
  UpdateSkillInput,
  CreateSkillStepInput,
} from '@/types/skill';

// Re-export for convenience
export type {
  AlbertSkill,
  AlbertSkillWithSteps,
  SkillStep,
  SkillExecution,
  SkillStatus,
  SkillParameter,
};

// ============================================
// Skill Functions (Albert's Skill Authoring)
// ============================================

/**
 * Initialize skill tables - call this from initDatabase()
 */
export async function initSkillTables(): Promise<void> {
  const db = getDb();

  // Skills table - stores skill definitions
  await db.execute(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      instructions TEXT DEFAULT '',
      system_context TEXT,
      triggers TEXT DEFAULT '[]',
      allowed_tools TEXT DEFAULT '[]',
      required_tools TEXT DEFAULT '[]',
      depends_on TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_by TEXT DEFAULT 'voice',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Skill steps table - stores workflow steps
  await db.execute(`
    CREATE TABLE IF NOT EXISTS skill_steps (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      tool_name TEXT NOT NULL,
      parameter_mapping TEXT DEFAULT '{}',
      condition TEXT,
      on_success TEXT,
      on_failure TEXT,
      retry_count INTEGER DEFAULT 0,
      output_key TEXT NOT NULL,
      extract_fields TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    )
  `);

  // Skill executions table - tracks execution history
  await db.execute(`
    CREATE TABLE IF NOT EXISTS skill_executions (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'paused', 'completed', 'failed')),
      current_step_id TEXT,
      input_data TEXT DEFAULT '{}',
      step_results TEXT DEFAULT '{}',
      context TEXT DEFAULT '{}',
      error TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for faster queries
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skill_steps_skill_id ON skill_steps(skill_id)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skill_executions_skill_id ON skill_executions(skill_id)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_skill_executions_status ON skill_executions(status)
  `);
}

/**
 * Generate a URL-safe slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64);
}

/**
 * Create a new skill
 */
export async function createSkill(input: CreateSkillInput): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const slug = generateSlug(input.name);

  await db.execute({
    sql: `INSERT INTO skills (id, name, slug, description, instructions, triggers, allowed_tools, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'voice')`,
    args: [
      id,
      input.name,
      slug,
      input.description,
      input.instructions || '',
      JSON.stringify(input.triggers),
      JSON.stringify(input.allowedTools || []),
    ],
  });

  // Add steps
  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i];
    const stepId = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO skill_steps (id, skill_id, step_order, name, description, tool_name, parameter_mapping, output_key, condition, on_success, on_failure, retry_count, extract_fields)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        stepId,
        id,
        i,
        step.name,
        step.description || null,
        step.toolName,
        JSON.stringify(step.parameterMapping),
        step.outputKey,
        step.condition || null,
        step.onSuccess || null,
        step.onFailure || null,
        step.retryCount || 0,
        JSON.stringify(step.extractFields || []),
      ],
    });
  }

  console.log(`[Skills] Created skill "${input.name}" with ${input.steps.length} steps`);
  return id;
}

/**
 * Get a skill by ID
 */
export async function getSkill(skillId: string): Promise<AlbertSkill | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM skills WHERE id = ?',
    args: [skillId],
  });
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string,
    version: row.version as string,
    instructions: row.instructions as string,
    systemContext: row.system_context as string | undefined,
    triggers: JSON.parse((row.triggers as string) || '[]'),
    allowedTools: JSON.parse((row.allowed_tools as string) || '[]'),
    requiredTools: JSON.parse((row.required_tools as string) || '[]'),
    dependsOn: JSON.parse((row.depends_on as string) || '[]'),
    isActive: (row.is_active as number) === 1,
    createdBy: row.created_by as 'voice' | 'manual' | 'import',
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Get a skill by slug
 */
export async function getSkillBySlug(slug: string): Promise<AlbertSkill | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM skills WHERE slug = ?',
    args: [slug],
  });
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string,
    version: row.version as string,
    instructions: row.instructions as string,
    systemContext: row.system_context as string | undefined,
    triggers: JSON.parse((row.triggers as string) || '[]'),
    allowedTools: JSON.parse((row.allowed_tools as string) || '[]'),
    requiredTools: JSON.parse((row.required_tools as string) || '[]'),
    dependsOn: JSON.parse((row.depends_on as string) || '[]'),
    isActive: (row.is_active as number) === 1,
    createdBy: row.created_by as 'voice' | 'manual' | 'import',
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Get a skill with its steps
 */
export async function getSkillWithSteps(skillId: string): Promise<AlbertSkillWithSteps | null> {
  const skill = await getSkill(skillId);
  if (!skill) return null;

  const steps = await getSkillSteps(skillId);
  return { ...skill, steps };
}

/**
 * List all skills
 */
export async function listSkills(activeOnly: boolean = false): Promise<AlbertSkill[]> {
  const db = getDb();
  const sql = activeOnly
    ? 'SELECT * FROM skills WHERE is_active = 1 ORDER BY updated_at DESC'
    : 'SELECT * FROM skills ORDER BY updated_at DESC';
  const result = await db.execute(sql);

  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string,
    version: row.version as string,
    instructions: row.instructions as string,
    systemContext: row.system_context as string | undefined,
    triggers: JSON.parse((row.triggers as string) || '[]'),
    allowedTools: JSON.parse((row.allowed_tools as string) || '[]'),
    requiredTools: JSON.parse((row.required_tools as string) || '[]'),
    dependsOn: JSON.parse((row.depends_on as string) || '[]'),
    isActive: (row.is_active as number) === 1,
    createdBy: row.created_by as 'voice' | 'manual' | 'import',
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }));
}

/**
 * Update a skill
 */
export async function updateSkill(skillId: string, updates: UpdateSkillInput): Promise<void> {
  const db = getDb();
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const args: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    args.push(updates.name);
    setClauses.push('slug = ?');
    args.push(generateSlug(updates.name));
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    args.push(updates.description);
  }
  if (updates.triggers !== undefined) {
    setClauses.push('triggers = ?');
    args.push(JSON.stringify(updates.triggers));
  }
  if (updates.instructions !== undefined) {
    setClauses.push('instructions = ?');
    args.push(updates.instructions);
  }
  if (updates.isActive !== undefined) {
    setClauses.push('is_active = ?');
    args.push(updates.isActive ? 1 : 0);
  }
  if (updates.allowedTools !== undefined) {
    setClauses.push('allowed_tools = ?');
    args.push(JSON.stringify(updates.allowedTools));
  }

  if (args.length === 0) return;

  args.push(skillId);
  await db.execute({
    sql: `UPDATE skills SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

/**
 * Delete a skill
 */
export async function deleteSkill(skillId: string): Promise<void> {
  const db = getDb();
  // Steps and executions will be deleted via CASCADE
  await db.execute({
    sql: 'DELETE FROM skills WHERE id = ?',
    args: [skillId],
  });
  console.log(`[Skills] Deleted skill ${skillId}`);
}

/**
 * Get steps for a skill
 */
export async function getSkillSteps(skillId: string): Promise<SkillStep[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM skill_steps WHERE skill_id = ? ORDER BY step_order ASC',
    args: [skillId],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    skillId: row.skill_id as string,
    order: row.step_order as number,
    name: row.name as string,
    description: row.description as string | undefined,
    toolName: row.tool_name as string,
    parameterMapping: JSON.parse((row.parameter_mapping as string) || '{}'),
    condition: row.condition as string | undefined,
    onSuccess: row.on_success as string | undefined,
    onFailure: row.on_failure as string | undefined,
    retryCount: row.retry_count as number,
    outputKey: row.output_key as string,
    extractFields: JSON.parse((row.extract_fields as string) || '[]'),
  }));
}

/**
 * Add a step to a skill
 */
export async function addSkillStep(skillId: string, step: CreateSkillStepInput): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  // Get current max order
  const maxOrderResult = await db.execute({
    sql: 'SELECT MAX(step_order) as max_order FROM skill_steps WHERE skill_id = ?',
    args: [skillId],
  });
  const maxOrder = (maxOrderResult.rows[0]?.max_order as number) ?? -1;
  const order = step.order ?? maxOrder + 1;

  await db.execute({
    sql: `INSERT INTO skill_steps (id, skill_id, step_order, name, description, tool_name, parameter_mapping, output_key, condition, on_success, on_failure, retry_count, extract_fields)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      skillId,
      order,
      step.name,
      step.description || null,
      step.toolName,
      JSON.stringify(step.parameterMapping),
      step.outputKey,
      step.condition || null,
      step.onSuccess || null,
      step.onFailure || null,
      step.retryCount || 0,
      JSON.stringify(step.extractFields || []),
    ],
  });

  // Update skill's updated_at
  await db.execute({
    sql: 'UPDATE skills SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [skillId],
  });

  return id;
}

/**
 * Update a skill step
 */
export async function updateSkillStep(
  stepId: string,
  updates: Partial<CreateSkillStepInput>
): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const args: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    args.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    args.push(updates.description);
  }
  if (updates.toolName !== undefined) {
    setClauses.push('tool_name = ?');
    args.push(updates.toolName);
  }
  if (updates.parameterMapping !== undefined) {
    setClauses.push('parameter_mapping = ?');
    args.push(JSON.stringify(updates.parameterMapping));
  }
  if (updates.outputKey !== undefined) {
    setClauses.push('output_key = ?');
    args.push(updates.outputKey);
  }
  if (updates.order !== undefined) {
    setClauses.push('step_order = ?');
    args.push(updates.order);
  }
  if (updates.condition !== undefined) {
    setClauses.push('condition = ?');
    args.push(updates.condition);
  }
  if (updates.retryCount !== undefined) {
    setClauses.push('retry_count = ?');
    args.push(updates.retryCount);
  }

  if (args.length === 0) return;

  args.push(stepId);
  await db.execute({
    sql: `UPDATE skill_steps SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

/**
 * Delete a skill step
 */
export async function deleteSkillStep(stepId: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM skill_steps WHERE id = ?',
    args: [stepId],
  });
}

/**
 * Reorder skill steps
 */
export async function reorderSkillSteps(skillId: string, stepIds: string[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < stepIds.length; i++) {
    await db.execute({
      sql: 'UPDATE skill_steps SET step_order = ? WHERE id = ? AND skill_id = ?',
      args: [i, stepIds[i], skillId],
    });
  }
}

// ============================================
// Skill Execution Functions
// ============================================

/**
 * Create a skill execution record
 */
export async function createSkillExecution(
  skillId: string,
  inputData: Record<string, unknown> = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO skill_executions (id, skill_id, status, input_data)
          VALUES (?, ?, 'pending', ?)`,
    args: [id, skillId, JSON.stringify(inputData)],
  });

  console.log(`[Skills] Created execution ${id} for skill ${skillId}`);
  return id;
}

/**
 * Get a skill execution by ID
 */
export async function getSkillExecution(executionId: string): Promise<SkillExecution | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM skill_executions WHERE id = ?',
    args: [executionId],
  });
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    skillId: row.skill_id as string,
    status: row.status as SkillStatus,
    currentStepId: row.current_step_id as string | undefined,
    inputData: JSON.parse((row.input_data as string) || '{}'),
    stepResults: JSON.parse((row.step_results as string) || '{}'),
    context: JSON.parse((row.context as string) || '{}'),
    error: row.error as string | undefined,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
  };
}

/**
 * Update a skill execution
 */
export async function updateSkillExecution(
  executionId: string,
  updates: Partial<{
    status: SkillStatus;
    currentStepId: string | null;
    stepResults: Record<string, unknown>;
    context: Record<string, unknown>;
    error: string | null;
    completedAt: Date;
  }>
): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const args: (string | null)[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    args.push(updates.status);
  }
  if (updates.currentStepId !== undefined) {
    setClauses.push('current_step_id = ?');
    args.push(updates.currentStepId);
  }
  if (updates.stepResults !== undefined) {
    setClauses.push('step_results = ?');
    args.push(JSON.stringify(updates.stepResults));
  }
  if (updates.context !== undefined) {
    setClauses.push('context = ?');
    args.push(JSON.stringify(updates.context));
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    args.push(updates.error);
  }
  if (updates.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    args.push(updates.completedAt.toISOString());
  }

  if (args.length === 0) return;

  args.push(executionId);
  await db.execute({
    sql: `UPDATE skill_executions SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

/**
 * Get recent executions for a skill
 */
export async function getSkillExecutions(
  skillId: string,
  limit: number = 10
): Promise<SkillExecution[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM skill_executions WHERE skill_id = ? ORDER BY started_at DESC LIMIT ?',
    args: [skillId, limit],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    skillId: row.skill_id as string,
    status: row.status as SkillStatus,
    currentStepId: row.current_step_id as string | undefined,
    inputData: JSON.parse((row.input_data as string) || '{}'),
    stepResults: JSON.parse((row.step_results as string) || '{}'),
    context: JSON.parse((row.context as string) || '{}'),
    error: row.error as string | undefined,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
  }));
}

/**
 * Get the most recent execution (for voice status checks)
 */
export async function getMostRecentExecution(): Promise<SkillExecution | null> {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM skill_executions ORDER BY started_at DESC LIMIT 1'
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    skillId: row.skill_id as string,
    status: row.status as SkillStatus,
    currentStepId: row.current_step_id as string | undefined,
    inputData: JSON.parse((row.input_data as string) || '{}'),
    stepResults: JSON.parse((row.step_results as string) || '{}'),
    context: JSON.parse((row.context as string) || '{}'),
    error: row.error as string | undefined,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
  };
}

/**
 * Get running/paused executions
 */
export async function getActiveExecutions(): Promise<SkillExecution[]> {
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM skill_executions WHERE status IN ('pending', 'running', 'paused') ORDER BY started_at DESC"
  );

  return result.rows.map(row => ({
    id: row.id as string,
    skillId: row.skill_id as string,
    status: row.status as SkillStatus,
    currentStepId: row.current_step_id as string | undefined,
    inputData: JSON.parse((row.input_data as string) || '{}'),
    stepResults: JSON.parse((row.step_results as string) || '{}'),
    context: JSON.parse((row.context as string) || '{}'),
    error: row.error as string | undefined,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
  }));
}

/**
 * Clean up old completed executions
 */
export async function cleanupOldExecutions(maxAgeDays: number = 30): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `DELETE FROM skill_executions
          WHERE status IN ('completed', 'failed')
          AND datetime(started_at) < datetime('now', '-' || ? || ' days')`,
    args: [maxAgeDays],
  });
  return result.rowsAffected;
}

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
      input.conversationId || null,
      input.userId || 'default-voice-user',
      input.taskDescription,
      input.taskType || 'general',
      input.subtasks ? JSON.stringify(input.subtasks) : null,
      input.priority || 0,
      input.parentTaskId || null,
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
  if (updates.completedSubtasks !== undefined) {
    setClauses.push('completed_subtasks = ?');
    args.push(JSON.stringify(updates.completedSubtasks));
  }
  if (updates.blockers !== undefined) {
    setClauses.push('blockers = ?');
    args.push(JSON.stringify(updates.blockers));
  }
  if (updates.context !== undefined) {
    setClauses.push('context = ?');
    args.push(updates.context);
  }
  if (updates.toolsUsed !== undefined) {
    setClauses.push('tools_used = ?');
    args.push(JSON.stringify(updates.toolsUsed));
  }
  if (updates.errorMessage !== undefined) {
    setClauses.push('error_message = ?');
    args.push(updates.errorMessage);
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
  return parseTaskMemoryRow(result.rows[0] as Record<string, unknown>);
}

export async function getActiveTasks(userId: string = 'default-voice-user'): Promise<TaskMemory[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM task_memory
          WHERE user_id = ? AND status IN ('pending', 'in_progress', 'blocked')
          ORDER BY priority DESC, started_at ASC`,
    args: [userId],
  });

  return result.rows.map(row => parseTaskMemoryRow(row as Record<string, unknown>));
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

  return result.rows.map(row => parseTaskMemoryRow(row as Record<string, unknown>));
}

export async function getTasksByConversation(conversationId: string): Promise<TaskMemory[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM task_memory WHERE conversation_id = ? ORDER BY started_at ASC',
    args: [conversationId],
  });

  return result.rows.map(row => parseTaskMemoryRow(row as Record<string, unknown>));
}

export async function getIncompleteTasksSummary(userId: string = 'default-voice-user'): Promise<string> {
  const tasks = await getActiveTasks(userId);
  if (tasks.length === 0) return '';

  const lines = ['Incomplete tasks from previous sessions:'];
  for (const task of tasks) {
    const statusEmoji = task.status === 'blocked' ? '🚫' : task.status === 'in_progress' ? '🔄' : '⏳';
    lines.push(`${statusEmoji} ${task.taskDescription}`);
    if (task.blockers && task.blockers.length > 0) {
      lines.push(`   Blocked by: ${task.blockers.join(', ')}`);
    }
    if (task.subtasks && task.completedSubtasks) {
      const remaining = task.subtasks.length - task.completedSubtasks.length;
      if (remaining > 0) {
        lines.push(`   ${remaining} subtasks remaining`);
      }
    }
  }

  return lines.join('\n');
}

export async function deleteTask(taskId: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM task_memory WHERE id = ?',
    args: [taskId],
  });
}

// ============================================
// Memory Effectiveness Functions
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
                  effectiveness_score = CAST(times_helpful + ? AS REAL) / CAST(times_retrieved + 2 AS REAL)
              WHERE memory_id = ?`,
        args: [helpfulIncrement, unhelpfulIncrement, rating, helpfulIncrement, memoryId],
      });
    }
  }
}

export async function getMemoryEffectiveness(memoryId: string): Promise<MemoryEffectiveness | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM memory_effectiveness WHERE memory_id = ?',
    args: [memoryId],
  });

  if (result.rows.length === 0) return null;
  return parseMemoryEffectivenessRow(result.rows[0] as Record<string, unknown>);
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

// Re-export task memory types for convenience
export type { TaskMemory, TaskType, TaskStatus, CreateTaskInput, UpdateTaskInput, MemoryEffectiveness };

export default getDb;
