// ============================================
// Medical AI Conversation Handler
// ============================================
// Handles patient conversations with clinical reasoning
// ============================================

import OpenAI from 'openai';
import { MemoryClient } from 'mem0ai';
import {
  getPatient,
  getLatestVitals,
  getMemories,
  getMessageHistory,
  addMemory,
  createAlert,
  Patient,
} from './db';
import {
  buildMedicalSystemPrompt,
  buildConversationContext,
  generateAnalysisPrompt,
  generateCheckInPrompt,
  PatientMedicalProfile,
  checkCommonInteractions,
} from './medical-prompts';
import { analyzeSymptoms, getCrisisResourcesText } from './medical-knowledge';

const openai = new OpenAI();
const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });

// ============================================
// Build Patient Medical Profile
// ============================================

export async function buildMedicalProfile(patientId: string): Promise<PatientMedicalProfile | null> {
  const patient = await getPatient(patientId);
  if (!patient) return null;

  const vitals = await getLatestVitals(patientId);
  const recentMemories = await getMemories(patientId, { type: 'symptom', limit: 5 });

  return {
    patientId: patient.id,
    firstName: patient.first_name,
    lastName: patient.last_name,
    dateOfBirth: patient.date_of_birth,
    conditions: patient.conditions,
    medications: patient.medications,
    allergies: patient.allergies,
    surgicalHistory: patient.surgical_history,
    familyHistory: patient.family_history,
    socialHistory: {
      smoking: patient.smoking_status,
      alcohol: patient.alcohol_use,
      exercise: patient.exercise_level,
      livingSituation: patient.living_situation,
    },
    currentConcerns: recentMemories.map(m => m.content),
    recentVitals: vitals ? {
      bloodPressure: vitals.blood_pressure,
      heartRate: vitals.heart_rate?.toString(),
      weight: vitals.weight?.toString(),
      bloodSugar: vitals.blood_sugar?.toString(),
      oxygenSaturation: vitals.oxygen_saturation?.toString(),
    } : undefined,
    careTeamNotes: patient.care_team_notes,
  };
}

// ============================================
// Search Patient Memories
// ============================================

export async function searchPatientMemories(patientId: string, query: string): Promise<string[]> {
  const memories: string[] = [];

  try {
    // Semantic search in Mem0
    const mem0Results = await mem0.search(query, {
      user_id: `patient_${patientId}`,
      limit: 5,
    });

    if (mem0Results && Array.isArray(mem0Results)) {
      for (const result of mem0Results) {
        if (result.memory) {
          memories.push(result.memory);
        }
      }
    }
  } catch (error) {
    console.error('Mem0 search error:', error);
  }

  // Also get recent DB memories
  const dbMemories = await getMemories(patientId, { limit: 10 });
  for (const mem of dbMemories) {
    if (!memories.some(m => m.includes(mem.content.slice(0, 30)))) {
      memories.push(mem.content);
    }
  }

  return memories.slice(0, 10);
}

// ============================================
// Generate AI Response
// ============================================

export interface MedicalAIResponse {
  message: string;
  urgencyLevel: 'routine' | 'soon' | 'urgent' | 'emergency';
  shouldAlert: boolean;
  alertDetails?: {
    type: string;
    severity: string;
    message: string;
    rationale: string;
  };
  clinicalNotes?: string;
}

export async function generateMedicalResponse(
  patientId: string,
  conversationId: string,
  userMessage: string
): Promise<MedicalAIResponse> {
  // Build medical profile
  const profile = await buildMedicalProfile(patientId);
  if (!profile) {
    return {
      message: "I'm having trouble accessing your information. Please try again or contact your care team directly.",
      urgencyLevel: 'routine',
      shouldAlert: false,
    };
  }

  // Build system prompt
  const systemPrompt = buildMedicalSystemPrompt(profile, profile.careTeamNotes[0]?.includes('Dr.') ? profile.careTeamNotes[0].split(':')[0] : 'Dr. Bander');

  // Search for relevant memories
  const memories = await searchPatientMemories(patientId, userMessage);

  // Build context-enhanced prompt
  const enhancedPrompt = buildConversationContext(systemPrompt, memories, userMessage);

  // Pre-analyze for urgency
  const symptomAnalysis = analyzeSymptoms(userMessage);

  // Check for crisis keywords
  const crisisKeywords = ['suicide', 'kill myself', 'want to die', 'end my life', 'no reason to live'];
  const isCrisis = crisisKeywords.some(kw => userMessage.toLowerCase().includes(kw));

  if (isCrisis) {
    // Immediate crisis response
    await createAlert(patientId, 'emotional_distress', 'urgent', 'Patient expressed suicidal ideation', {
      clinicalRationale: 'Crisis keywords detected in message',
      context: userMessage,
    });

    return {
      message: `${profile.firstName}, I'm very concerned about what you're sharing. Your safety matters most right now.

Please reach out for immediate support:
📞 Crisis Lifeline: Call or text 988
🆘 Emergency: 911
💬 Text HOME to 741741

You're not alone, and people want to help. Are you safe right now? Is there someone who can be with you?

I'm also alerting your care team so they can reach out to support you.`,
      urgencyLevel: 'emergency',
      shouldAlert: true,
      alertDetails: {
        type: 'emotional_distress',
        severity: 'urgent',
        message: 'Patient expressed suicidal ideation',
        rationale: 'Crisis keywords detected - immediate follow-up needed',
      },
    };
  }

  // Get recent conversation history
  const history = await getMessageHistory(patientId, 10);

  // Build messages for GPT
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: enhancedPrompt },
  ];

  // Add conversation history
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current message
  messages.push({ role: 'user', content: userMessage });

  try {
    // Generate response with clinical analysis
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        ...messages,
        {
          role: 'system',
          content: `Respond to the patient and provide clinical analysis.

Return JSON:
{
  "response": "Your warm, medically-informed response to the patient (WhatsApp appropriate length)",
  "clinicalAnalysis": {
    "urgencyLevel": "routine|soon|urgent|emergency",
    "shouldAlert": boolean,
    "alertType": "symptom_concern|medication_issue|emotional_distress|adherence|null",
    "alertSeverity": "low|medium|high|urgent|null",
    "alertMessage": "Brief message for care team" or null,
    "clinicalRationale": "Why this is/isn't concerning" or null,
    "memoriesToStore": [
      {
        "type": "symptom|medication|lifestyle|emotional|preference",
        "content": "What to remember",
        "clinicalRelevance": "Why this matters"
      }
    ]
  }
}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);

    // Store memories
    if (parsed.clinicalAnalysis?.memoriesToStore) {
      for (const mem of parsed.clinicalAnalysis.memoriesToStore) {
        if (mem.content) {
          await addMemory(patientId, conversationId, mem.type || 'clinical_note', mem.content, {
            clinicalRelevance: mem.clinicalRelevance,
            importance: 0.7,
          });

          // Also store in Mem0
          try {
            await mem0.add([{ role: 'user', content: mem.content }], {
              user_id: `patient_${patientId}`,
              metadata: { type: mem.type, clinicalRelevance: mem.clinicalRelevance },
            });
          } catch (e) {
            console.error('Mem0 add error:', e);
          }
        }
      }
    }

    // Create alert if needed
    const analysis = parsed.clinicalAnalysis;
    if (analysis?.shouldAlert && analysis?.alertType) {
      await createAlert(patientId, analysis.alertType, analysis.alertSeverity || 'medium', analysis.alertMessage || 'Flagged for review', {
        clinicalRationale: analysis.clinicalRationale,
        context: userMessage,
      });
    }

    return {
      message: parsed.response || "I'm here for you. Could you tell me more about how you're feeling?",
      urgencyLevel: analysis?.urgencyLevel || symptomAnalysis.highestUrgency,
      shouldAlert: analysis?.shouldAlert || false,
      alertDetails: analysis?.shouldAlert ? {
        type: analysis.alertType,
        severity: analysis.alertSeverity,
        message: analysis.alertMessage,
        rationale: analysis.clinicalRationale,
      } : undefined,
      clinicalNotes: analysis?.clinicalRationale,
    };
  } catch (error) {
    console.error('Medical AI error:', error);

    // Fallback response
    return {
      message: "I'm having a moment processing that. Could you share more details about how you're feeling?",
      urgencyLevel: symptomAnalysis.highestUrgency,
      shouldAlert: symptomAnalysis.highestUrgency === 'urgent' || symptomAnalysis.highestUrgency === 'emergency',
    };
  }
}

// ============================================
// Generate Check-in Message
// ============================================

export async function generateCheckIn(patientId: string): Promise<string | null> {
  const profile = await buildMedicalProfile(patientId);
  if (!profile) return null;

  // Check last interaction
  const patient = await getPatient(patientId);
  if (patient?.last_interaction) {
    const hoursSince = (Date.now() - patient.last_interaction.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return null; // Don't check in more than once per day
  }

  const checkInPrompt = generateCheckInPrompt(profile);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: checkInPrompt },
        { role: 'user', content: 'Generate a check-in message.' },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Check-in generation error:', error);
    return null;
  }
}

// ============================================
// Post-Conversation Analysis
// ============================================

export async function analyzeConversation(
  patientId: string,
  conversationId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<void> {
  const profile = await buildMedicalProfile(patientId);
  if (!profile) return;

  const analysisPrompt = generateAnalysisPrompt(profile);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: analysisPrompt },
        { role: 'user', content: `Conversation:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const analysis = JSON.parse(completion.choices[0].message.content || '{}');

    // Store any additional memories
    if (analysis.memoriestoStore) {
      for (const mem of analysis.memoriestoStore) {
        await addMemory(patientId, conversationId, mem.type, mem.content, {
          clinicalRelevance: mem.clinicalRelevance,
          importance: 0.6,
        });
      }
    }

    // Create any additional alerts
    if (analysis.alertsToCreate) {
      for (const alert of analysis.alertsToCreate) {
        await createAlert(patientId, alert.type, alert.severity, alert.message, {
          clinicalRationale: alert.clinicalRationale,
        });
      }
    }

    console.log(`Conversation analysis complete for ${profile.firstName}:`, analysis.clinicalSummary);
  } catch (error) {
    console.error('Conversation analysis error:', error);
  }
}

// ============================================
// Medication Interaction Check
// ============================================

export async function checkMedicationSafety(patientId: string, newMedication: string): Promise<{
  safe: boolean;
  warnings: string[];
}> {
  const patient = await getPatient(patientId);
  if (!patient) return { safe: true, warnings: [] };

  const allMeds = [...patient.medications, newMedication];
  const warnings = checkCommonInteractions(allMeds);

  // Check allergies
  const allergyWarnings: string[] = [];
  for (const allergy of patient.allergies) {
    if (newMedication.toLowerCase().includes(allergy.toLowerCase())) {
      allergyWarnings.push(`ALLERGY ALERT: Patient is allergic to ${allergy}`);
    }
  }

  return {
    safe: warnings.length === 0 && allergyWarnings.length === 0,
    warnings: [...allergyWarnings, ...warnings],
  };
}
