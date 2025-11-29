import { createClient, Client } from '@libsql/client';

// ============================================
// Multi-Tenant Patient Database
// ============================================
// This module extends the base database to support
// multiple patients, each with their own AI assistant
// ============================================

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
// Patient Type Definitions
// ============================================

export interface Patient {
  id: string;
  external_id: string; // Your internal patient ID
  first_name: string;
  last_name: string;
  phone_number: string; // WhatsApp number (with country code)
  email?: string;
  date_of_birth?: string;
  medical_context?: string; // High-level medical context for the AI
  ai_personality_preset?: string; // e.g., 'supportive', 'direct', 'gentle'
  created_at: Date;
  last_interaction: Date | null;
  is_active: boolean;
}

export interface PatientFamily {
  id: string;
  patient_id: string;
  name: string;
  relationship: string; // e.g., 'spouse', 'child', 'caregiver'
  phone_number: string;
  can_receive_updates: boolean;
  created_at: Date;
}

export interface PatientConversation {
  id: string;
  patient_id: string;
  channel: 'whatsapp' | 'voice' | 'web';
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  summary: string | null;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'concerned';
  flagged_for_review: boolean;
  flag_reason?: string;
}

export interface PatientMemory {
  id: string;
  patient_id: string;
  conversation_id: string;
  memory_type: 'symptom' | 'medication' | 'concern' | 'lifestyle' | 'emotional' | 'milestone' | 'preference' | 'general';
  content: string;
  importance: number; // 0-1
  emotional_valence: number; // -1 to 1
  metadata?: Record<string, unknown>;
  created_at: Date;
}

export interface PatientAIModel {
  patient_id: string;
  // Personality traits (0-1)
  personality_warmth: number;
  personality_directness: number;
  personality_medical_detail: number;
  personality_encouragement: number;
  personality_check_in_frequency: number;
  // Learned preferences
  communication_preferences: string[];
  topics_to_avoid: string[];
  topics_to_encourage: string[];
  // Medical awareness
  conditions: string[];
  medications: string[];
  care_team_notes: string[];
  // Relationship
  growth_narrative: string;
  last_updated: Date;
}

export interface PatientAlert {
  id: string;
  patient_id: string;
  alert_type: 'symptom_concern' | 'medication_issue' | 'emotional_distress' | 'missed_checkin' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  context: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  created_at: Date;
}

// ============================================
// Database Initialization
// ============================================

export async function initPatientDatabase() {
  const db = getDb();

  // Patients table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      external_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT UNIQUE NOT NULL,
      email TEXT,
      date_of_birth TEXT,
      medical_context TEXT,
      ai_personality_preset TEXT DEFAULT 'supportive',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_interaction DATETIME,
      is_active BOOLEAN DEFAULT 1
    )
  `);

  // Patient family members (for WhatsApp group support)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_family (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      can_receive_updates BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  // Patient-specific conversations
  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_conversations (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER,
      summary TEXT,
      sentiment TEXT,
      flagged_for_review BOOLEAN DEFAULT 0,
      flag_reason TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  // Patient-specific memories
  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_memories (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      conversation_id TEXT,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL DEFAULT 0.5,
      emotional_valence REAL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (conversation_id) REFERENCES patient_conversations(id)
    )
  `);

  // Patient-specific AI personality model
  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_ai_models (
      patient_id TEXT PRIMARY KEY,
      personality_warmth REAL DEFAULT 0.8,
      personality_directness REAL DEFAULT 0.5,
      personality_medical_detail REAL DEFAULT 0.6,
      personality_encouragement REAL DEFAULT 0.7,
      personality_check_in_frequency REAL DEFAULT 0.5,
      communication_preferences TEXT DEFAULT '[]',
      topics_to_avoid TEXT DEFAULT '[]',
      topics_to_encourage TEXT DEFAULT '[]',
      conditions TEXT DEFAULT '[]',
      medications TEXT DEFAULT '[]',
      care_team_notes TEXT DEFAULT '[]',
      growth_narrative TEXT DEFAULT '',
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  // Alerts for care team
  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_alerts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'low',
      message TEXT NOT NULL,
      context TEXT,
      acknowledged BOOLEAN DEFAULT 0,
      acknowledged_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  // WhatsApp message log (for compliance/audit)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      conversation_id TEXT,
      direction TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      whatsapp_message_id TEXT,
      status TEXT DEFAULT 'sent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (conversation_id) REFERENCES patient_conversations(id)
    )
  `);

  console.log('Patient database initialized');
}

// ============================================
// Patient CRUD Operations
// ============================================

export async function createPatient(patient: Omit<Patient, 'id' | 'created_at' | 'last_interaction' | 'is_active'>): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO patients (id, external_id, first_name, last_name, phone_number, email, date_of_birth, medical_context, ai_personality_preset)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      patient.external_id,
      patient.first_name,
      patient.last_name,
      patient.phone_number,
      patient.email || null,
      patient.date_of_birth || null,
      patient.medical_context || null,
      patient.ai_personality_preset || 'supportive',
    ],
  });

  // Initialize AI model for this patient
  await db.execute({
    sql: `INSERT INTO patient_ai_models (patient_id) VALUES (?)`,
    args: [id],
  });

  return id;
}

export async function getPatient(id: string): Promise<Patient | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM patients WHERE id = ?',
    args: [id],
  });

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    id: row.id as string,
    external_id: row.external_id as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    phone_number: row.phone_number as string,
    email: row.email as string | undefined,
    date_of_birth: row.date_of_birth as string | undefined,
    medical_context: row.medical_context as string | undefined,
    ai_personality_preset: row.ai_personality_preset as string | undefined,
    created_at: new Date(row.created_at as string),
    last_interaction: row.last_interaction ? new Date(row.last_interaction as string) : null,
    is_active: Boolean(row.is_active),
  };
}

export async function getPatientByPhone(phoneNumber: string): Promise<Patient | null> {
  const db = getDb();
  // Normalize phone number (remove spaces, dashes, etc.)
  const normalized = phoneNumber.replace(/[\s\-\(\)]/g, '');

  const result = await db.execute({
    sql: 'SELECT * FROM patients WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone_number, " ", ""), "-", ""), "(", ""), ")", "") = ?',
    args: [normalized],
  });

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    id: row.id as string,
    external_id: row.external_id as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    phone_number: row.phone_number as string,
    email: row.email as string | undefined,
    date_of_birth: row.date_of_birth as string | undefined,
    medical_context: row.medical_context as string | undefined,
    ai_personality_preset: row.ai_personality_preset as string | undefined,
    created_at: new Date(row.created_at as string),
    last_interaction: row.last_interaction ? new Date(row.last_interaction as string) : null,
    is_active: Boolean(row.is_active),
  };
}

export async function updatePatient(id: string, updates: Partial<Patient>): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const args: (string | number | boolean | null)[] = [];

  const allowedFields = ['first_name', 'last_name', 'phone_number', 'email', 'date_of_birth', 'medical_context', 'ai_personality_preset', 'is_active'];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      args.push(value as string | number | boolean | null);
    }
  }

  if (setClauses.length === 0) return;

  args.push(id);
  await db.execute({
    sql: `UPDATE patients SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function getAllPatients(activeOnly: boolean = true): Promise<Patient[]> {
  const db = getDb();
  const sql = activeOnly
    ? 'SELECT * FROM patients WHERE is_active = 1 ORDER BY last_name, first_name'
    : 'SELECT * FROM patients ORDER BY last_name, first_name';

  const result = await db.execute(sql);

  return result.rows.map(row => ({
    id: row.id as string,
    external_id: row.external_id as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    phone_number: row.phone_number as string,
    email: row.email as string | undefined,
    date_of_birth: row.date_of_birth as string | undefined,
    medical_context: row.medical_context as string | undefined,
    ai_personality_preset: row.ai_personality_preset as string | undefined,
    created_at: new Date(row.created_at as string),
    last_interaction: row.last_interaction ? new Date(row.last_interaction as string) : null,
    is_active: Boolean(row.is_active),
  }));
}

// ============================================
// Patient Family Operations
// ============================================

export async function addFamilyMember(member: Omit<PatientFamily, 'id' | 'created_at'>): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO patient_family (id, patient_id, name, relationship, phone_number, can_receive_updates)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, member.patient_id, member.name, member.relationship, member.phone_number, member.can_receive_updates ? 1 : 0],
  });

  return id;
}

export async function getPatientFamily(patientId: string): Promise<PatientFamily[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM patient_family WHERE patient_id = ?',
    args: [patientId],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    patient_id: row.patient_id as string,
    name: row.name as string,
    relationship: row.relationship as string,
    phone_number: row.phone_number as string,
    can_receive_updates: Boolean(row.can_receive_updates),
    created_at: new Date(row.created_at as string),
  }));
}

// ============================================
// Patient Conversation Operations
// ============================================

export async function createPatientConversation(patientId: string, channel: 'whatsapp' | 'voice' | 'web' = 'whatsapp'): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: 'INSERT INTO patient_conversations (id, patient_id, channel) VALUES (?, ?, ?)',
    args: [id, patientId, channel],
  });

  // Update patient's last interaction
  await db.execute({
    sql: 'UPDATE patients SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?',
    args: [patientId],
  });

  return id;
}

export async function endPatientConversation(
  conversationId: string,
  summary?: string,
  sentiment?: PatientConversation['sentiment'],
  flagged?: { reason: string }
): Promise<void> {
  const db = getDb();

  // Calculate duration
  const conv = await db.execute({
    sql: 'SELECT started_at FROM patient_conversations WHERE id = ?',
    args: [conversationId],
  });

  if (conv.rows[0]) {
    const startedAt = new Date(conv.rows[0].started_at as string);
    const duration = Math.floor((Date.now() - startedAt.getTime()) / 1000);

    await db.execute({
      sql: `UPDATE patient_conversations
            SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ?, summary = ?, sentiment = ?, flagged_for_review = ?, flag_reason = ?
            WHERE id = ?`,
      args: [duration, summary || null, sentiment || null, flagged ? 1 : 0, flagged?.reason || null, conversationId],
    });
  }
}

export async function getPatientConversations(patientId: string, limit: number = 50): Promise<PatientConversation[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM patient_conversations WHERE patient_id = ? ORDER BY started_at DESC LIMIT ?',
    args: [patientId, limit],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    patient_id: row.patient_id as string,
    channel: row.channel as 'whatsapp' | 'voice' | 'web',
    started_at: new Date(row.started_at as string),
    ended_at: row.ended_at ? new Date(row.ended_at as string) : null,
    duration_seconds: row.duration_seconds as number | null,
    summary: row.summary as string | null,
    sentiment: row.sentiment as PatientConversation['sentiment'] | undefined,
    flagged_for_review: Boolean(row.flagged_for_review),
    flag_reason: row.flag_reason as string | undefined,
  }));
}

// ============================================
// Patient Memory Operations
// ============================================

export async function addPatientMemory(
  patientId: string,
  conversationId: string,
  memoryType: PatientMemory['memory_type'],
  content: string,
  options: { importance?: number; emotionalValence?: number; metadata?: Record<string, unknown> } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO patient_memories (id, patient_id, conversation_id, memory_type, content, importance, emotional_valence, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      patientId,
      conversationId,
      memoryType,
      content,
      options.importance ?? 0.5,
      options.emotionalValence ?? 0,
      JSON.stringify(options.metadata ?? {}),
    ],
  });

  return id;
}

export async function getPatientMemories(
  patientId: string,
  options: { type?: PatientMemory['memory_type']; minImportance?: number; limit?: number } = {}
): Promise<PatientMemory[]> {
  const db = getDb();
  let sql = 'SELECT * FROM patient_memories WHERE patient_id = ?';
  const args: (string | number)[] = [patientId];

  if (options.type) {
    sql += ' AND memory_type = ?';
    args.push(options.type);
  }
  if (options.minImportance) {
    sql += ' AND importance >= ?';
    args.push(options.minImportance);
  }

  sql += ' ORDER BY created_at DESC';

  if (options.limit) {
    sql += ' LIMIT ?';
    args.push(options.limit);
  }

  const result = await db.execute({ sql, args });

  return result.rows.map(row => ({
    id: row.id as string,
    patient_id: row.patient_id as string,
    conversation_id: row.conversation_id as string,
    memory_type: row.memory_type as PatientMemory['memory_type'],
    content: row.content as string,
    importance: row.importance as number,
    emotional_valence: row.emotional_valence as number,
    metadata: JSON.parse((row.metadata as string) || '{}'),
    created_at: new Date(row.created_at as string),
  }));
}

// ============================================
// Patient AI Model Operations
// ============================================

export async function getPatientAIModel(patientId: string): Promise<PatientAIModel | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM patient_ai_models WHERE patient_id = ?',
    args: [patientId],
  });

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    patient_id: row.patient_id as string,
    personality_warmth: row.personality_warmth as number,
    personality_directness: row.personality_directness as number,
    personality_medical_detail: row.personality_medical_detail as number,
    personality_encouragement: row.personality_encouragement as number,
    personality_check_in_frequency: row.personality_check_in_frequency as number,
    communication_preferences: JSON.parse((row.communication_preferences as string) || '[]'),
    topics_to_avoid: JSON.parse((row.topics_to_avoid as string) || '[]'),
    topics_to_encourage: JSON.parse((row.topics_to_encourage as string) || '[]'),
    conditions: JSON.parse((row.conditions as string) || '[]'),
    medications: JSON.parse((row.medications as string) || '[]'),
    care_team_notes: JSON.parse((row.care_team_notes as string) || '[]'),
    growth_narrative: (row.growth_narrative as string) || '',
    last_updated: new Date(row.last_updated as string),
  };
}

export async function updatePatientAIModel(patientId: string, updates: Partial<PatientAIModel>): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const args: (string | number)[] = [];

  const numericFields = ['personality_warmth', 'personality_directness', 'personality_medical_detail', 'personality_encouragement', 'personality_check_in_frequency'];
  const jsonFields = ['communication_preferences', 'topics_to_avoid', 'topics_to_encourage', 'conditions', 'medications', 'care_team_notes'];

  for (const [key, value] of Object.entries(updates)) {
    if (numericFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      args.push(value as number);
    } else if (jsonFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      args.push(JSON.stringify(value));
    } else if (key === 'growth_narrative') {
      setClauses.push('growth_narrative = ?');
      args.push(value as string);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push('last_updated = CURRENT_TIMESTAMP');
  args.push(patientId);

  await db.execute({
    sql: `UPDATE patient_ai_models SET ${setClauses.join(', ')} WHERE patient_id = ?`,
    args,
  });
}

// ============================================
// Patient Alerts Operations
// ============================================

export async function createAlert(
  patientId: string,
  alertType: PatientAlert['alert_type'],
  severity: PatientAlert['severity'],
  message: string,
  context?: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO patient_alerts (id, patient_id, alert_type, severity, message, context)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, patientId, alertType, severity, message, context || null],
  });

  return id;
}

export async function getUnacknowledgedAlerts(patientId?: string): Promise<PatientAlert[]> {
  const db = getDb();
  let sql = 'SELECT * FROM patient_alerts WHERE acknowledged = 0';
  const args: string[] = [];

  if (patientId) {
    sql += ' AND patient_id = ?';
    args.push(patientId);
  }

  sql += ' ORDER BY CASE severity WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 ELSE 4 END, created_at DESC';

  const result = await db.execute({ sql, args });

  return result.rows.map(row => ({
    id: row.id as string,
    patient_id: row.patient_id as string,
    alert_type: row.alert_type as PatientAlert['alert_type'],
    severity: row.severity as PatientAlert['severity'],
    message: row.message as string,
    context: row.context as string,
    acknowledged: Boolean(row.acknowledged),
    acknowledged_by: row.acknowledged_by as string | undefined,
    created_at: new Date(row.created_at as string),
  }));
}

export async function acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE patient_alerts SET acknowledged = 1, acknowledged_by = ? WHERE id = ?',
    args: [acknowledgedBy, alertId],
  });
}

// ============================================
// WhatsApp Message Logging
// ============================================

export async function logWhatsAppMessage(
  patientId: string,
  conversationId: string | null,
  direction: 'inbound' | 'outbound',
  content: string,
  whatsappMessageId?: string,
  messageType: string = 'text'
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO whatsapp_messages (id, patient_id, conversation_id, direction, message_type, content, whatsapp_message_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, patientId, conversationId, direction, messageType, content, whatsappMessageId || null],
  });

  return id;
}

export async function getWhatsAppHistory(patientId: string, limit: number = 100): Promise<Array<{
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  created_at: Date;
}>> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id, direction, content, created_at FROM whatsapp_messages WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?',
    args: [patientId, limit],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    direction: row.direction as 'inbound' | 'outbound',
    content: row.content as string,
    created_at: new Date(row.created_at as string),
  })).reverse(); // Return in chronological order
}

export default getDb;
