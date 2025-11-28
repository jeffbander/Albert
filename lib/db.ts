import { createClient, Client } from '@libsql/client';

let dbClient: Client | null = null;

function getDb(): Client {
  if (!dbClient) {
    dbClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
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
  last_updated: Date;
}

export async function initDatabase() {
  const db = getDb();

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Initialize Echo's self model if it doesn't exist
  await db.execute(`
    INSERT OR IGNORE INTO echo_self_model (id) VALUES ('singleton')
  `);
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

export default getDb;
