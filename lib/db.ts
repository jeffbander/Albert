import { createClient, Client } from '@libsql/client';

// ============================================
// CareSync AI - Patient Database
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
// Type Definitions
// ============================================

export interface Patient {
  id: string;
  external_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  phone_number: string;
  email?: string;
  // Medical profile
  conditions: string[];
  medications: string[];
  allergies: string[];
  surgical_history: string[];
  family_history: string[];
  // Social history
  smoking_status?: string;
  alcohol_use?: string;
  exercise_level?: string;
  living_situation?: string;
  // Care settings
  primary_doctor: string;
  care_team_notes: string[];
  // Status
  created_at: Date;
  last_interaction: Date | null;
  is_active: boolean;
}

export interface PatientVitals {
  id: string;
  patient_id: string;
  recorded_at: Date;
  blood_pressure?: string;
  heart_rate?: number;
  weight?: number;
  blood_sugar?: number;
  temperature?: number;
  oxygen_saturation?: number;
  notes?: string;
}

export interface PatientConversation {
  id: string;
  patient_id: string;
  channel: 'whatsapp' | 'voice' | 'web';
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  clinical_summary: string | null;
  sentiment: string | null;
  flagged_for_review: boolean;
  flag_reason?: string;
}

export interface PatientMemory {
  id: string;
  patient_id: string;
  conversation_id: string;
  memory_type: 'symptom' | 'medication' | 'lifestyle' | 'emotional' | 'preference' | 'milestone' | 'clinical_note';
  content: string;
  clinical_relevance?: string;
  importance: number;
  created_at: Date;
}

export interface ClinicalAlert {
  id: string;
  patient_id: string;
  alert_type: 'symptom_concern' | 'medication_issue' | 'emotional_distress' | 'missed_checkin' | 'vital_abnormal' | 'adherence';
  severity: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  clinical_rationale?: string;
  context?: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: Date;
  created_at: Date;
}

export interface PatientAIModel {
  patient_id: string;
  // Communication style (learned)
  preferred_communication: string[];
  topics_discussed: string[];
  // Engagement metrics
  response_rate: number;
  avg_message_length: number;
  best_contact_times: string[];
  // Clinical focus
  active_concerns: string[];
  goals: string[];
  last_updated: Date;
}

// ============================================
// Database Initialization
// ============================================

export async function initDatabase() {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      external_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT,
      phone_number TEXT UNIQUE NOT NULL,
      email TEXT,
      conditions TEXT DEFAULT '[]',
      medications TEXT DEFAULT '[]',
      allergies TEXT DEFAULT '[]',
      surgical_history TEXT DEFAULT '[]',
      family_history TEXT DEFAULT '[]',
      smoking_status TEXT,
      alcohol_use TEXT,
      exercise_level TEXT,
      living_situation TEXT,
      primary_doctor TEXT DEFAULT 'Dr. Bander',
      care_team_notes TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_interaction DATETIME,
      is_active BOOLEAN DEFAULT 1
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_vitals (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      blood_pressure TEXT,
      heart_rate INTEGER,
      weight REAL,
      blood_sugar REAL,
      temperature REAL,
      oxygen_saturation REAL,
      notes TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_conversations (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      channel TEXT DEFAULT 'whatsapp',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER,
      clinical_summary TEXT,
      sentiment TEXT,
      flagged_for_review BOOLEAN DEFAULT 0,
      flag_reason TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_memories (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      conversation_id TEXT,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      clinical_relevance TEXT,
      importance REAL DEFAULT 0.5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinical_alerts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'low',
      message TEXT NOT NULL,
      clinical_rationale TEXT,
      context TEXT,
      acknowledged BOOLEAN DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS patient_ai_models (
      patient_id TEXT PRIMARY KEY,
      preferred_communication TEXT DEFAULT '[]',
      topics_discussed TEXT DEFAULT '[]',
      response_rate REAL DEFAULT 0,
      avg_message_length REAL DEFAULT 0,
      best_contact_times TEXT DEFAULT '[]',
      active_concerns TEXT DEFAULT '[]',
      goals TEXT DEFAULT '[]',
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      conversation_id TEXT,
      direction TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      whatsapp_message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  console.log('CareSync AI database initialized');
}

// ============================================
// Patient Operations
// ============================================

export async function createPatient(patient: Omit<Patient, 'id' | 'created_at' | 'last_interaction' | 'is_active'>): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO patients (id, external_id, first_name, last_name, date_of_birth, phone_number, email,
          conditions, medications, allergies, surgical_history, family_history,
          smoking_status, alcohol_use, exercise_level, living_situation, primary_doctor, care_team_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      patient.external_id,
      patient.first_name,
      patient.last_name,
      patient.date_of_birth || null,
      patient.phone_number,
      patient.email || null,
      JSON.stringify(patient.conditions || []),
      JSON.stringify(patient.medications || []),
      JSON.stringify(patient.allergies || []),
      JSON.stringify(patient.surgical_history || []),
      JSON.stringify(patient.family_history || []),
      patient.smoking_status || null,
      patient.alcohol_use || null,
      patient.exercise_level || null,
      patient.living_situation || null,
      patient.primary_doctor || 'Dr. Bander',
      JSON.stringify(patient.care_team_notes || []),
    ],
  });

  // Initialize AI model
  await db.execute({
    sql: 'INSERT INTO patient_ai_models (patient_id) VALUES (?)',
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
  return parsePatientRow(result.rows[0]);
}

export async function getPatientByPhone(phone: string): Promise<Patient | null> {
  const db = getDb();
  const normalized = phone.replace(/[\s\-\(\)]/g, '');

  const result = await db.execute({
    sql: `SELECT * FROM patients WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '(', ''), ')', '') = ?`,
    args: [normalized],
  });

  if (!result.rows[0]) return null;
  return parsePatientRow(result.rows[0]);
}

export async function getAllPatients(activeOnly: boolean = true): Promise<Patient[]> {
  const db = getDb();
  const sql = activeOnly
    ? 'SELECT * FROM patients WHERE is_active = 1 ORDER BY last_name, first_name'
    : 'SELECT * FROM patients ORDER BY last_name, first_name';

  const result = await db.execute(sql);
  return result.rows.map(parsePatientRow);
}

export async function updatePatient(id: string, updates: Partial<Patient>): Promise<void> {
  const db = getDb();
  const setClauses: string[] = [];
  const args: unknown[] = [];

  const jsonFields = ['conditions', 'medications', 'allergies', 'surgical_history', 'family_history', 'care_team_notes'];
  const stringFields = ['first_name', 'last_name', 'date_of_birth', 'phone_number', 'email', 'smoking_status', 'alcohol_use', 'exercise_level', 'living_situation', 'primary_doctor'];

  for (const [key, value] of Object.entries(updates)) {
    if (jsonFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      args.push(JSON.stringify(value));
    } else if (stringFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      args.push(value);
    } else if (key === 'is_active') {
      setClauses.push('is_active = ?');
      args.push(value ? 1 : 0);
    }
  }

  if (setClauses.length === 0) return;

  args.push(id);
  await db.execute({
    sql: `UPDATE patients SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

function parsePatientRow(row: Record<string, unknown>): Patient {
  return {
    id: row.id as string,
    external_id: row.external_id as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    date_of_birth: row.date_of_birth as string | undefined,
    phone_number: row.phone_number as string,
    email: row.email as string | undefined,
    conditions: JSON.parse((row.conditions as string) || '[]'),
    medications: JSON.parse((row.medications as string) || '[]'),
    allergies: JSON.parse((row.allergies as string) || '[]'),
    surgical_history: JSON.parse((row.surgical_history as string) || '[]'),
    family_history: JSON.parse((row.family_history as string) || '[]'),
    smoking_status: row.smoking_status as string | undefined,
    alcohol_use: row.alcohol_use as string | undefined,
    exercise_level: row.exercise_level as string | undefined,
    living_situation: row.living_situation as string | undefined,
    primary_doctor: row.primary_doctor as string,
    care_team_notes: JSON.parse((row.care_team_notes as string) || '[]'),
    created_at: new Date(row.created_at as string),
    last_interaction: row.last_interaction ? new Date(row.last_interaction as string) : null,
    is_active: Boolean(row.is_active),
  };
}

// ============================================
// Vitals Operations
// ============================================

export async function recordVitals(patientId: string, vitals: Partial<PatientVitals>): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO patient_vitals (id, patient_id, blood_pressure, heart_rate, weight, blood_sugar, temperature, oxygen_saturation, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      patientId,
      vitals.blood_pressure || null,
      vitals.heart_rate || null,
      vitals.weight || null,
      vitals.blood_sugar || null,
      vitals.temperature || null,
      vitals.oxygen_saturation || null,
      vitals.notes || null,
    ],
  });

  return id;
}

export async function getLatestVitals(patientId: string): Promise<PatientVitals | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM patient_vitals WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 1',
    args: [patientId],
  });

  if (!result.rows[0]) return null;
  const row = result.rows[0];

  return {
    id: row.id as string,
    patient_id: row.patient_id as string,
    recorded_at: new Date(row.recorded_at as string),
    blood_pressure: row.blood_pressure as string | undefined,
    heart_rate: row.heart_rate as number | undefined,
    weight: row.weight as number | undefined,
    blood_sugar: row.blood_sugar as number | undefined,
    temperature: row.temperature as number | undefined,
    oxygen_saturation: row.oxygen_saturation as number | undefined,
    notes: row.notes as string | undefined,
  };
}

// ============================================
// Conversation Operations
// ============================================

export async function createConversation(patientId: string, channel: 'whatsapp' | 'voice' | 'web' = 'whatsapp'): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: 'INSERT INTO patient_conversations (id, patient_id, channel) VALUES (?, ?, ?)',
    args: [id, patientId, channel],
  });

  await db.execute({
    sql: 'UPDATE patients SET last_interaction = CURRENT_TIMESTAMP WHERE id = ?',
    args: [patientId],
  });

  return id;
}

export async function endConversation(
  conversationId: string,
  summary?: string,
  sentiment?: string,
  flagged?: { reason: string }
): Promise<void> {
  const db = getDb();

  const conv = await db.execute({
    sql: 'SELECT started_at FROM patient_conversations WHERE id = ?',
    args: [conversationId],
  });

  if (conv.rows[0]) {
    const startedAt = new Date(conv.rows[0].started_at as string);
    const duration = Math.floor((Date.now() - startedAt.getTime()) / 1000);

    await db.execute({
      sql: `UPDATE patient_conversations SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ?, clinical_summary = ?, sentiment = ?, flagged_for_review = ?, flag_reason = ? WHERE id = ?`,
      args: [duration, summary || null, sentiment || null, flagged ? 1 : 0, flagged?.reason || null, conversationId],
    });
  }
}

// ============================================
// Memory Operations
// ============================================

export async function addMemory(
  patientId: string,
  conversationId: string,
  type: PatientMemory['memory_type'],
  content: string,
  options: { clinicalRelevance?: string; importance?: number } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO patient_memories (id, patient_id, conversation_id, memory_type, content, clinical_relevance, importance)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, patientId, conversationId, type, content, options.clinicalRelevance || null, options.importance ?? 0.5],
  });

  return id;
}

export async function getMemories(patientId: string, options: { type?: string; limit?: number } = {}): Promise<PatientMemory[]> {
  const db = getDb();
  let sql = 'SELECT * FROM patient_memories WHERE patient_id = ?';
  const args: unknown[] = [patientId];

  if (options.type) {
    sql += ' AND memory_type = ?';
    args.push(options.type);
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
    clinical_relevance: row.clinical_relevance as string | undefined,
    importance: row.importance as number,
    created_at: new Date(row.created_at as string),
  }));
}

// ============================================
// Alert Operations
// ============================================

export async function createAlert(
  patientId: string,
  type: ClinicalAlert['alert_type'],
  severity: ClinicalAlert['severity'],
  message: string,
  options: { clinicalRationale?: string; context?: string } = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO clinical_alerts (id, patient_id, alert_type, severity, message, clinical_rationale, context)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, patientId, type, severity, message, options.clinicalRationale || null, options.context || null],
  });

  return id;
}

export async function getUnacknowledgedAlerts(patientId?: string): Promise<ClinicalAlert[]> {
  const db = getDb();
  let sql = 'SELECT * FROM clinical_alerts WHERE acknowledged = 0';
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
    alert_type: row.alert_type as ClinicalAlert['alert_type'],
    severity: row.severity as ClinicalAlert['severity'],
    message: row.message as string,
    clinical_rationale: row.clinical_rationale as string | undefined,
    context: row.context as string | undefined,
    acknowledged: Boolean(row.acknowledged),
    acknowledged_by: row.acknowledged_by as string | undefined,
    acknowledged_at: row.acknowledged_at ? new Date(row.acknowledged_at as string) : undefined,
    created_at: new Date(row.created_at as string),
  }));
}

export async function acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE clinical_alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [acknowledgedBy, alertId],
  });
}

// ============================================
// WhatsApp Message Logging
// ============================================

export async function logMessage(
  patientId: string,
  conversationId: string | null,
  direction: 'inbound' | 'outbound',
  content: string,
  whatsappMessageId?: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO whatsapp_messages (id, patient_id, conversation_id, direction, content, whatsapp_message_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, patientId, conversationId, direction, content, whatsappMessageId || null],
  });

  return id;
}

export async function getMessageHistory(patientId: string, limit: number = 50): Promise<Array<{ role: 'user' | 'assistant'; content: string; created_at: Date }>> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT direction, content, created_at FROM whatsapp_messages WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?',
    args: [patientId, limit],
  });

  return result.rows.map(row => ({
    role: row.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: row.content as string,
    created_at: new Date(row.created_at as string),
  })).reverse();
}

export default getDb;
