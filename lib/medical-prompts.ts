// ============================================
// Medical AI Prompt System
// ============================================
// This module creates specialized prompts that
// make the AI understand and reason like an MD
// ============================================

import {
  getConditionContext,
  getMedicationContext,
  analyzeSymptoms,
  getCrisisResourcesText,
  COMMON_CONDITIONS,
  COMMON_MEDICATIONS,
} from './medical-knowledge';

export interface PatientMedicalProfile {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  conditions: string[];
  medications: string[];
  allergies: string[];
  surgicalHistory: string[];
  familyHistory: string[];
  socialHistory: {
    smoking?: string;
    alcohol?: string;
    exercise?: string;
    occupation?: string;
    livingSituation?: string;
  };
  currentConcerns: string[];
  recentVitals?: {
    bloodPressure?: string;
    heartRate?: string;
    weight?: string;
    bloodSugar?: string;
    temperature?: string;
    oxygenSaturation?: string;
  };
  careTeamNotes: string[];
}

// ============================================
// Core Medical AI System Prompt
// ============================================

export function buildMedicalSystemPrompt(
  patient: PatientMedicalProfile,
  doctorName: string = 'Dr. Bander'
): string {
  const conditionContext = getConditionContext(patient.conditions);
  const medicationContext = getMedicationContext(patient.medications);

  const allergiesText = patient.allergies.length > 0
    ? `\nALLERGIES (IMPORTANT): ${patient.allergies.join(', ')}`
    : '';

  const vitalsText = patient.recentVitals
    ? `\nRECENT VITALS:
${patient.recentVitals.bloodPressure ? `- Blood Pressure: ${patient.recentVitals.bloodPressure}` : ''}
${patient.recentVitals.heartRate ? `- Heart Rate: ${patient.recentVitals.heartRate}` : ''}
${patient.recentVitals.weight ? `- Weight: ${patient.recentVitals.weight}` : ''}
${patient.recentVitals.bloodSugar ? `- Blood Sugar: ${patient.recentVitals.bloodSugar}` : ''}
${patient.recentVitals.oxygenSaturation ? `- O2 Saturation: ${patient.recentVitals.oxygenSaturation}` : ''}`
    : '';

  const socialHistoryText = patient.socialHistory
    ? `\nSOCIAL HISTORY:
${patient.socialHistory.smoking ? `- Smoking: ${patient.socialHistory.smoking}` : ''}
${patient.socialHistory.alcohol ? `- Alcohol: ${patient.socialHistory.alcohol}` : ''}
${patient.socialHistory.exercise ? `- Exercise: ${patient.socialHistory.exercise}` : ''}
${patient.socialHistory.livingSituation ? `- Living Situation: ${patient.socialHistory.livingSituation}` : ''}`
    : '';

  return `You are a Medical AI Assistant working under the supervision of ${doctorName}. You provide personalized health support to patients between visits. You have medical training equivalent to a physician and understand clinical reasoning, but you always defer to the care team for diagnoses and treatment decisions.

==================================================
PATIENT: ${patient.firstName} ${patient.lastName}
${patient.dateOfBirth ? `DOB: ${patient.dateOfBirth}` : ''}
==================================================

ACTIVE CONDITIONS:
${patient.conditions.length > 0 ? patient.conditions.map(c => `• ${c}`).join('\n') : '• No active conditions documented'}
${allergiesText}

CURRENT MEDICATIONS:
${patient.medications.length > 0 ? patient.medications.map(m => `• ${m}`).join('\n') : '• No medications documented'}
${vitalsText}${socialHistoryText}

${patient.careTeamNotes.length > 0 ? `CARE TEAM NOTES:\n${patient.careTeamNotes.map(n => `• ${n}`).join('\n')}` : ''}

==================================================
MEDICAL KNOWLEDGE CONTEXT
==================================================
${conditionContext}
${medicationContext}

==================================================
YOUR CLINICAL APPROACH
==================================================

1. CLINICAL REASONING:
   - Think like a physician when analyzing patient concerns
   - Consider the whole patient: their conditions, medications, and context
   - Use pattern recognition to identify concerning symptoms
   - Ask targeted follow-up questions like an MD would
   - Consider differential diagnoses but don't diagnose

2. COMMUNICATION STYLE:
   - Use patient-friendly language, but you CAN use medical terms if helpful (explain them)
   - Be warm, empathetic, and supportive
   - Validate concerns - patients know their bodies
   - Be appropriately reassuring without dismissing concerns
   - Keep messages concise for WhatsApp (but thorough when needed)

3. SYMPTOM ASSESSMENT:
   When a patient reports symptoms, mentally assess:
   - Onset: When did it start?
   - Location: Where exactly?
   - Duration: How long does it last?
   - Character: What does it feel like?
   - Aggravating/Alleviating: What makes it better/worse?
   - Radiation: Does it spread anywhere?
   - Timing: When does it occur?
   - Severity: Scale of 1-10?

4. RED FLAG RECOGNITION:
   Immediately flag and escalate if you detect:
   - Chest pain with shortness of breath
   - Signs of stroke (FAST: Face drooping, Arm weakness, Speech difficulty, Time to call 911)
   - Suicidal or self-harm ideation
   - Severe allergic reaction (anaphylaxis)
   - Uncontrolled bleeding
   - Signs of sepsis (fever + confusion + rapid HR)
   - Severe hypoglycemia
   - Symptoms of heart attack or stroke

5. MEDICATION COUNSELING:
   - Reinforce proper medication taking
   - Watch for drug interactions
   - Recognize side effects
   - Never recommend stopping or changing medications without MD approval
   - Encourage adherence

6. LIFESTYLE COACHING:
   - Encourage evidence-based lifestyle modifications
   - Be realistic and supportive, not preachy
   - Celebrate small wins
   - Connect lifestyle to their specific conditions

==================================================
BOUNDARIES - CRITICAL
==================================================

YOU MUST NOT:
❌ Diagnose conditions
❌ Recommend starting, stopping, or changing medications
❌ Provide specific dosing instructions
❌ Replace the physician relationship
❌ Give advice that contradicts the care team

YOU SHOULD:
✅ Recognize concerning symptoms and escalate appropriately
✅ Provide education about their conditions
✅ Encourage medication adherence
✅ Support lifestyle modifications
✅ Refer to the care team for medical decisions
✅ Provide emotional support and validation

==================================================
ESCALATION PROTOCOL
==================================================

EMERGENCY (Call 911): Chest pain + SOB, stroke symptoms, severe allergic reaction, suicidal with plan
URGENT (Contact today): New significant symptoms, medication reactions, fever >101.3°F, falls, confusion
SOON (Within 24-48h): Worsening chronic symptoms, medication questions, new concerns
ROUTINE (Next visit): General questions, lifestyle coaching, progress updates

${getCrisisResourcesText()}

Remember: You are an extension of ${doctorName}'s care team. Your role is to provide continuous support, early detection of problems, and ensure patients feel heard and cared for between visits.`;
}

// ============================================
// Dynamic Context Injection
// ============================================

export function buildConversationContext(
  basePrompt: string,
  memories: string[],
  currentMessage: string
): string {
  // Analyze the current message for symptoms
  const symptomAnalysis = analyzeSymptoms(currentMessage);

  let contextAdditions = '';

  // Add memory context if available
  if (memories.length > 0) {
    contextAdditions += `
RELEVANT HISTORY FROM PAST CONVERSATIONS:
${memories.map(m => `• ${m}`).join('\n')}
`;
  }

  // Add symptom analysis if detected
  if (symptomAnalysis.detectedPatterns.length > 0) {
    contextAdditions += `
CLINICAL ALERT - SYMPTOM PATTERN DETECTED:
Urgency Level: ${symptomAnalysis.highestUrgency.toUpperCase()}
Possible concerns: ${symptomAnalysis.detectedPatterns.flatMap(p => p.possibleConcerns).join(', ')}

Suggested assessment questions:
${symptomAnalysis.suggestedQuestions.map(q => `• ${q}`).join('\n')}

Recommended action: ${symptomAnalysis.detectedPatterns[0].recommendedAction}
`;
  }

  return `${basePrompt}
${contextAdditions}
Use this context to provide informed, personalized care. Remember to think clinically but communicate warmly.`;
}

// ============================================
// Specialized Response Types
// ============================================

export const RESPONSE_TEMPLATES = {
  symptomAssessment: `
Based on what you've shared, I want to understand better:
{{questions}}

This helps me give you the best guidance and know if we need to involve your care team right away.`,

  medicationReminder: `
I noticed you mentioned {{medication}}. Just a reminder:
• {{counselingPoint1}}
• {{counselingPoint2}}

If you have concerns about this medication, let's make sure to bring it up with your care team.`,

  escalation: `
{{patientName}}, based on what you're describing, I think it's important to {{action}}.

{{reason}}

{{urgentInstructions}}

I'll also flag this for your care team to review.`,

  encouragement: `
That's really positive progress, {{patientName}}! {{specificPraise}}

Keep it up - small consistent steps make a big difference with {{condition}}.`,

  crisis: `
{{patientName}}, I'm concerned about what you're sharing. Your safety is the most important thing right now.

Please reach out for immediate support:
• Crisis Lifeline: Call or text 988
• Emergency: 911
• Text HOME to 741741

You're not alone, and help is available right now. Are you safe?`,
};

// ============================================
// Proactive Check-in Prompts
// ============================================

export function generateCheckInPrompt(patient: PatientMedicalProfile): string {
  const topics: string[] = [];

  // Condition-specific check-ins
  for (const condition of patient.conditions) {
    const normalized = condition.toLowerCase();
    if (normalized.includes('diabetes')) {
      topics.push('blood sugar management and any highs/lows');
    }
    if (normalized.includes('hypertension') || normalized.includes('blood pressure')) {
      topics.push('blood pressure readings and any headaches/dizziness');
    }
    if (normalized.includes('heart') || normalized.includes('cardiac')) {
      topics.push('any chest discomfort, shortness of breath, or swelling');
    }
    if (normalized.includes('copd') || normalized.includes('asthma')) {
      topics.push('breathing and inhaler use');
    }
    if (normalized.includes('depression') || normalized.includes('anxiety')) {
      topics.push('mood and sleep');
    }
  }

  // Medication adherence
  if (patient.medications.length > 0) {
    topics.push('any issues with medications');
  }

  // Current concerns
  if (patient.currentConcerns.length > 0) {
    topics.push(`how things are going with ${patient.currentConcerns[0]}`);
  }

  const topicsList = topics.length > 0
    ? topics.slice(0, 3).join(', ')
    : 'how you\'re feeling overall';

  return `Generate a brief, warm check-in message for ${patient.firstName} that:
- Feels personal, not automated
- May touch on: ${topicsList}
- Is appropriate for WhatsApp (brief)
- Invites them to share how they're doing
- Is medically informed but not clinical in tone`;
}

// ============================================
// Post-Conversation Analysis Prompt
// ============================================

export function generateAnalysisPrompt(patient: PatientMedicalProfile): string {
  return `Analyze this conversation with ${patient.firstName} ${patient.lastName}.

PATIENT CONTEXT:
- Conditions: ${patient.conditions.join(', ') || 'None documented'}
- Medications: ${patient.medications.join(', ') || 'None documented'}

Provide clinical analysis in JSON format:
{
  "clinicalSummary": "1-2 sentence clinical summary of the conversation",
  "symptomsMentioned": [
    {
      "symptom": "description",
      "relatedCondition": "most likely related condition or null",
      "severity": "mild|moderate|severe",
      "followUpNeeded": boolean
    }
  ],
  "medicationConcerns": [
    {
      "medication": "name",
      "concern": "description",
      "urgency": "routine|soon|urgent"
    }
  ],
  "alertsToCreate": [
    {
      "type": "symptom_concern|medication_issue|emotional_distress|lifestyle|adherence",
      "severity": "low|medium|high|urgent",
      "message": "Brief alert message for care team",
      "clinicalRationale": "Why this is concerning"
    }
  ],
  "memoriestoStore": [
    {
      "type": "symptom|medication|lifestyle|emotional|preference|milestone",
      "content": "What to remember",
      "clinicalRelevance": "Why this matters medically"
    }
  ],
  "sentiment": "positive|neutral|concerned|distressed",
  "patientEngagement": "high|moderate|low",
  "suggestedFollowUp": "What to check on next time"
}`;
}

// ============================================
// Educational Content Generator
// ============================================

export function generateEducationPrompt(topic: string, patientLevel: 'basic' | 'intermediate' | 'advanced' = 'intermediate'): string {
  return `Explain ${topic} to a patient at a ${patientLevel} understanding level.

Guidelines:
- Use clear, everyday language
- Include practical takeaways
- Relate to daily life
- Acknowledge it can be confusing
- End with an invitation to ask questions
- Keep it brief (WhatsApp appropriate)
- Be accurate - this is medical education`;
}

// ============================================
// Drug Interaction Warning
// ============================================

export function checkCommonInteractions(medications: string[]): string[] {
  const warnings: string[] = [];
  const meds = medications.map(m => m.toLowerCase());

  // ACE Inhibitor + NSAID
  if ((meds.some(m => m.includes('lisinopril') || m.includes('enalapril') || m.includes('pril'))) &&
      (meds.some(m => m.includes('ibuprofen') || m.includes('naproxen') || m.includes('advil') || m.includes('aleve')))) {
    warnings.push('ACE inhibitor + NSAID: May reduce blood pressure medication effectiveness and affect kidneys');
  }

  // Blood thinner + NSAID
  if ((meds.some(m => m.includes('warfarin') || m.includes('eliquis') || m.includes('xarelto'))) &&
      (meds.some(m => m.includes('ibuprofen') || m.includes('aspirin')))) {
    warnings.push('Blood thinner + NSAID: Increased bleeding risk');
  }

  // Metformin + Alcohol (as a note)
  if (meds.some(m => m.includes('metformin'))) {
    warnings.push('Metformin: Avoid excessive alcohol due to risk of lactic acidosis');
  }

  // Statin + Grapefruit
  if (meds.some(m => m.includes('atorvastatin') || m.includes('simvastatin') || m.includes('lovastatin'))) {
    warnings.push('Statin note: Avoid grapefruit juice as it can increase medication levels');
  }

  return warnings;
}
