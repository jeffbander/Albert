// ============================================
// Patient-Specific AI Conversation Handler
// ============================================
// Handles text-based conversations via WhatsApp
// Each patient gets a personalized AI assistant
// ============================================

import OpenAI from 'openai';
import { MemoryClient } from 'mem0ai';
import {
  getPatient,
  getPatientByPhone,
  getPatientAIModel,
  getPatientMemories,
  getPatientConversations,
  addPatientMemory,
  updatePatientAIModel,
  createAlert,
  getWhatsAppHistory,
  Patient,
  PatientAIModel,
  PatientMemory,
} from './patient-db';

const openai = new OpenAI();
const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });

// ============================================
// Patient-Specific System Prompt
// ============================================

export function buildPatientSystemPrompt(
  patient: Patient,
  aiModel: PatientAIModel,
  doctorName: string = 'Dr. Bander'
): string {
  const personalityTraits: string[] = [];

  // Build personality description from traits
  if (aiModel.personality_warmth > 0.7) personalityTraits.push('warm and caring');
  else if (aiModel.personality_warmth > 0.4) personalityTraits.push('friendly');

  if (aiModel.personality_directness > 0.7) personalityTraits.push('direct and clear');
  else if (aiModel.personality_directness < 0.3) personalityTraits.push('gentle in approach');

  if (aiModel.personality_medical_detail > 0.7) personalityTraits.push('detailed when explaining medical topics');
  else if (aiModel.personality_medical_detail < 0.3) personalityTraits.push('uses simple terms for medical concepts');

  if (aiModel.personality_encouragement > 0.7) personalityTraits.push('encouraging');
  if (aiModel.personality_check_in_frequency > 0.7) personalityTraits.push('proactive about check-ins');

  const personalityDescription = personalityTraits.length > 0
    ? personalityTraits.join(', ')
    : 'supportive and balanced';

  // Build conditions awareness
  const conditionsContext = aiModel.conditions.length > 0
    ? `\n\nMEDICAL CONTEXT (use sensitively):\n- Conditions: ${aiModel.conditions.join(', ')}`
    : '';

  const medicationsContext = aiModel.medications.length > 0
    ? `\n- Medications: ${aiModel.medications.join(', ')}`
    : '';

  // Build topics guidance
  const topicsToAvoid = aiModel.topics_to_avoid.length > 0
    ? `\n\nTOPICS TO BE CAREFUL WITH:\n${aiModel.topics_to_avoid.map(t => `- ${t}`).join('\n')}`
    : '';

  const topicsToEncourage = aiModel.topics_to_encourage.length > 0
    ? `\n\nTOPICS TO ENCOURAGE:\n${aiModel.topics_to_encourage.map(t => `- ${t}`).join('\n')}`
    : '';

  // Care team notes
  const careTeamNotes = aiModel.care_team_notes.length > 0
    ? `\n\nCARE TEAM NOTES:\n${aiModel.care_team_notes.map(n => `- ${n}`).join('\n')}`
    : '';

  return `You are a personal AI health companion for ${patient.first_name} ${patient.last_name}. You work with ${doctorName}'s care team to provide ongoing support and engagement between appointments.

YOUR ROLE:
- You are NOT a replacement for medical care - you're a supportive companion
- You can discuss general wellness, listen to concerns, and help ${patient.first_name} feel supported
- You encourage ${patient.first_name} to contact their care team for medical questions
- You remember past conversations and build a relationship over time

YOUR PERSONALITY:
${personalityDescription}

COMMUNICATION STYLE:
- Use WhatsApp-appropriate message length (concise but caring)
- Use emojis sparingly when appropriate
- Be conversational, not clinical
- Reference past conversations naturally
- Check in on things ${patient.first_name} has shared before
${aiModel.communication_preferences.length > 0 ? `\nLearned preferences:\n${aiModel.communication_preferences.map(p => `- ${p}`).join('\n')}` : ''}
${conditionsContext}${medicationsContext}${topicsToAvoid}${topicsToEncourage}${careTeamNotes}

IMPORTANT BOUNDARIES:
- NEVER diagnose conditions or recommend specific treatments
- NEVER advise changing medications without consulting their doctor
- If ${patient.first_name} describes concerning symptoms, encourage them to contact ${doctorName}'s office
- If there's any mention of self-harm, crisis, or emergency, provide crisis resources and urge immediate help

WHEN TO ALERT THE CARE TEAM:
Flag for review if ${patient.first_name} mentions:
- New or worsening symptoms
- Medication side effects or confusion
- Emotional distress or anxiety about their condition
- Missing medications or appointments
- Any concerning changes

${patient.medical_context ? `\nADDITIONAL CONTEXT FROM CARE TEAM:\n${patient.medical_context}` : ''}

Remember: You're here to be a consistent, caring presence between medical visits. Be genuine, be helpful, and always prioritize ${patient.first_name}'s wellbeing.`;
}

// ============================================
// Memory Search and Context Building
// ============================================

export async function searchPatientMemories(
  patientId: string,
  query: string
): Promise<string[]> {
  try {
    // Search Mem0 for semantic matches
    const mem0Results = await mem0.search(query, {
      user_id: `patient_${patientId}`,
      limit: 5,
    });

    const memories: string[] = [];

    if (mem0Results && Array.isArray(mem0Results)) {
      for (const result of mem0Results) {
        if (result.memory) {
          memories.push(result.memory);
        }
      }
    }

    // Also get recent structured memories from DB
    const dbMemories = await getPatientMemories(patientId, {
      minImportance: 0.6,
      limit: 10,
    });

    for (const mem of dbMemories) {
      if (!memories.some(m => m.includes(mem.content.slice(0, 30)))) {
        memories.push(mem.content);
      }
    }

    return memories.slice(0, 10); // Limit context size
  } catch (error) {
    console.error('Error searching patient memories:', error);
    return [];
  }
}

export async function buildConversationContext(
  patientId: string,
  currentMessage: string
): Promise<{
  systemPrompt: string;
  memories: string[];
  recentHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}> {
  const patient = await getPatient(patientId);
  if (!patient) {
    throw new Error(`Patient not found: ${patientId}`);
  }

  const aiModel = await getPatientAIModel(patientId);
  if (!aiModel) {
    throw new Error(`AI model not found for patient: ${patientId}`);
  }

  // Build system prompt
  const systemPrompt = buildPatientSystemPrompt(patient, aiModel);

  // Search for relevant memories
  const memories = await searchPatientMemories(patientId, currentMessage);

  // Get recent WhatsApp history for context
  const whatsappHistory = await getWhatsAppHistory(patientId, 20);
  const recentHistory = whatsappHistory.map(msg => ({
    role: msg.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: msg.content,
  }));

  return {
    systemPrompt,
    memories,
    recentHistory,
  };
}

// ============================================
// AI Response Generation
// ============================================

export interface AIResponse {
  message: string;
  shouldAlert: boolean;
  alertType?: 'symptom_concern' | 'medication_issue' | 'emotional_distress' | 'custom';
  alertSeverity?: 'low' | 'medium' | 'high' | 'urgent';
  alertReason?: string;
  extractedMemories?: Array<{
    type: PatientMemory['memory_type'];
    content: string;
    importance: number;
  }>;
}

export async function generatePatientResponse(
  patientId: string,
  conversationId: string,
  userMessage: string
): Promise<AIResponse> {
  // Build context
  const { systemPrompt, memories, recentHistory } = await buildConversationContext(patientId, userMessage);

  // Build messages array for GPT
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add memory context if available
  if (memories.length > 0) {
    messages.push({
      role: 'system',
      content: `RELEVANT MEMORIES ABOUT THIS PATIENT:\n${memories.map(m => `- ${m}`).join('\n')}\n\nUse these naturally in conversation.`,
    });
  }

  // Add recent conversation history
  for (const msg of recentHistory.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current message
  messages.push({ role: 'user', content: userMessage });

  try {
    // Generate response with structured output for analysis
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        ...messages,
        {
          role: 'system',
          content: `After responding, also analyze if this conversation needs care team attention.

Respond in JSON format:
{
  "response": "Your conversational response to the patient",
  "analysis": {
    "shouldAlert": boolean,
    "alertType": "symptom_concern" | "medication_issue" | "emotional_distress" | null,
    "alertSeverity": "low" | "medium" | "high" | "urgent" | null,
    "alertReason": "Brief explanation" | null,
    "memories": [
      {
        "type": "symptom" | "medication" | "concern" | "lifestyle" | "emotional" | "milestone" | "preference" | "general",
        "content": "What to remember",
        "importance": 0.0-1.0
      }
    ]
  }
}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);

    // Store extracted memories
    if (parsed.analysis?.memories && Array.isArray(parsed.analysis.memories)) {
      for (const mem of parsed.analysis.memories) {
        if (mem.content && mem.type) {
          await addPatientMemory(patientId, conversationId, mem.type, mem.content, {
            importance: mem.importance || 0.5,
          });

          // Also store in Mem0 for semantic search
          try {
            await mem0.add([{ role: 'user', content: mem.content }], {
              user_id: `patient_${patientId}`,
              metadata: { type: mem.type, importance: mem.importance },
            });
          } catch (e) {
            console.error('Error storing memory in Mem0:', e);
          }
        }
      }
    }

    // Create alert if needed
    if (parsed.analysis?.shouldAlert && parsed.analysis?.alertType) {
      await createAlert(
        patientId,
        parsed.analysis.alertType,
        parsed.analysis.alertSeverity || 'medium',
        parsed.analysis.alertReason || 'Flagged for review',
        userMessage
      );
    }

    return {
      message: parsed.response || "I'm here for you. How can I help?",
      shouldAlert: parsed.analysis?.shouldAlert || false,
      alertType: parsed.analysis?.alertType,
      alertSeverity: parsed.analysis?.alertSeverity,
      alertReason: parsed.analysis?.alertReason,
      extractedMemories: parsed.analysis?.memories,
    };
  } catch (error) {
    console.error('Error generating patient response:', error);

    // Fallback response
    return {
      message: "I'm having a moment - could you say that again?",
      shouldAlert: false,
    };
  }
}

// ============================================
// Proactive Check-in Messages
// ============================================

export async function generateCheckInMessage(patientId: string): Promise<string | null> {
  const patient = await getPatient(patientId);
  if (!patient) return null;

  const aiModel = await getPatientAIModel(patientId);
  if (!aiModel) return null;

  // Check if we should do a check-in based on personality
  if (aiModel.personality_check_in_frequency < 0.3) return null;

  // Get recent memories to personalize check-in
  const recentMemories = await getPatientMemories(patientId, { limit: 5 });
  const recentConversations = await getPatientConversations(patientId, 3);

  // Check if enough time has passed since last interaction
  if (patient.last_interaction) {
    const hoursSinceLastInteraction = (Date.now() - patient.last_interaction.getTime()) / (1000 * 60 * 60);
    // Don't check in more than once per day
    if (hoursSinceLastInteraction < 24) return null;
  }

  const memoryContext = recentMemories.length > 0
    ? `Recent things they've shared: ${recentMemories.map(m => m.content).join('; ')}`
    : 'No recent specific topics.';

  const lastConvoSummary = recentConversations.length > 0 && recentConversations[0].summary
    ? `Last conversation was about: ${recentConversations[0].summary}`
    : '';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You're sending a proactive check-in message to ${patient.first_name}, a patient you support.

Your personality: ${aiModel.personality_warmth > 0.7 ? 'warm' : 'friendly'}, ${aiModel.personality_encouragement > 0.7 ? 'encouraging' : 'supportive'}

${memoryContext}
${lastConvoSummary}

Generate a brief, natural WhatsApp check-in message. It should feel personal, not automated.
Examples of good check-ins:
- Following up on something they mentioned
- A general "thinking of you" wellness check
- Gentle reminder about self-care

Keep it under 50 words. Don't be overly medical or clinical.`,
        },
      ],
      temperature: 0.8,
      max_tokens: 100,
    });

    return completion.choices[0].message.content || null;
  } catch (error) {
    console.error('Error generating check-in:', error);
    return null;
  }
}

// ============================================
// Post-Conversation Reflection
// ============================================

export async function reflectOnConversation(
  patientId: string,
  conversationId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<void> {
  const patient = await getPatient(patientId);
  const aiModel = await getPatientAIModel(patientId);
  if (!patient || !aiModel) return;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Analyze this conversation with ${patient.first_name} and extract learnings.

Current personality settings:
- Warmth: ${aiModel.personality_warmth}
- Directness: ${aiModel.personality_directness}
- Medical detail: ${aiModel.personality_medical_detail}
- Encouragement: ${aiModel.personality_encouragement}

Provide analysis in JSON:
{
  "conversationSummary": "1-2 sentence summary",
  "sentiment": "positive" | "neutral" | "negative" | "concerned",
  "personalityAdjustments": {
    "warmth": -0.05 to 0.05 or null,
    "directness": -0.05 to 0.05 or null,
    "medical_detail": -0.05 to 0.05 or null,
    "encouragement": -0.05 to 0.05 or null
  },
  "newCommunicationInsights": ["insight 1", "insight 2"] or [],
  "topicsToAvoid": ["topic"] or [],
  "topicsToEncourage": ["topic"] or [],
  "growthNarrativeAddition": "Brief note about the relationship development" or null
}`,
        },
        {
          role: 'user',
          content: `Conversation:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const analysis = JSON.parse(completion.choices[0].message.content || '{}');

    // Apply personality adjustments
    const updates: Partial<PatientAIModel> = {};
    const adj = analysis.personalityAdjustments;

    if (adj?.warmth) {
      updates.personality_warmth = Math.max(0, Math.min(1, aiModel.personality_warmth + adj.warmth));
    }
    if (adj?.directness) {
      updates.personality_directness = Math.max(0, Math.min(1, aiModel.personality_directness + adj.directness));
    }
    if (adj?.medical_detail) {
      updates.personality_medical_detail = Math.max(0, Math.min(1, aiModel.personality_medical_detail + adj.medical_detail));
    }
    if (adj?.encouragement) {
      updates.personality_encouragement = Math.max(0, Math.min(1, aiModel.personality_encouragement + adj.encouragement));
    }

    // Add communication insights
    if (analysis.newCommunicationInsights?.length > 0) {
      const newInsights = [...aiModel.communication_preferences, ...analysis.newCommunicationInsights].slice(-10);
      updates.communication_preferences = newInsights;
    }

    // Add topics to avoid/encourage
    if (analysis.topicsToAvoid?.length > 0) {
      const newAvoid = [...new Set([...aiModel.topics_to_avoid, ...analysis.topicsToAvoid])];
      updates.topics_to_avoid = newAvoid;
    }
    if (analysis.topicsToEncourage?.length > 0) {
      const newEncourage = [...new Set([...aiModel.topics_to_encourage, ...analysis.topicsToEncourage])];
      updates.topics_to_encourage = newEncourage;
    }

    // Update growth narrative
    if (analysis.growthNarrativeAddition) {
      const narrative = aiModel.growth_narrative
        ? `${aiModel.growth_narrative}\n\n${new Date().toLocaleDateString()}: ${analysis.growthNarrativeAddition}`
        : `${new Date().toLocaleDateString()}: ${analysis.growthNarrativeAddition}`;
      updates.growth_narrative = narrative;
    }

    if (Object.keys(updates).length > 0) {
      await updatePatientAIModel(patientId, updates);
    }
  } catch (error) {
    console.error('Error reflecting on conversation:', error);
  }
}

// ============================================
// Quick Actions / Button Responses
// ============================================

export const QUICK_ACTIONS = {
  CHECK_IN: {
    id: 'check_in',
    title: "I'm doing okay",
  },
  NEED_SUPPORT: {
    id: 'need_support',
    title: 'Need to talk',
  },
  QUESTION: {
    id: 'question',
    title: 'Have a question',
  },
  MEDICATION: {
    id: 'medication',
    title: 'About my meds',
  },
} as const;

export function getQuickActionButtons(): Array<{ id: string; title: string }> {
  return Object.values(QUICK_ACTIONS);
}

export async function handleQuickAction(
  patientId: string,
  actionId: string
): Promise<string> {
  const patient = await getPatient(patientId);
  if (!patient) return "I'm not sure who you are. Please contact your care team.";

  switch (actionId) {
    case 'check_in':
      return `That's great to hear, ${patient.first_name}! Is there anything specific you'd like to chat about today?`;
    case 'need_support':
      return `I'm here for you, ${patient.first_name}. Tell me what's on your mind - I'm listening. 💙`;
    case 'question':
      return `Of course! What would you like to know? If it's a medical question, I might suggest reaching out to your care team, but I'm happy to help however I can.`;
    case 'medication':
      return `Sure, let's talk about your medications. Are you having any concerns or questions about how to take them?`;
    default:
      return `Thanks for reaching out! How can I help you today?`;
  }
}
