// ============================================
// Medical Knowledge Base
// ============================================
// This module provides medical context, terminology,
// clinical reasoning patterns, and symptom analysis
// for the AI assistant to act as a knowledgeable MD
// ============================================

// ============================================
// Common Medical Conditions Reference
// ============================================

export interface MedicalCondition {
  name: string;
  icd10?: string;
  category: string;
  description: string;
  commonSymptoms: string[];
  redFlags: string[]; // Symptoms requiring immediate attention
  managementGoals: string[];
  lifestyleFactors: string[];
  monitoringMetrics: string[];
  relatedConditions: string[];
}

export const COMMON_CONDITIONS: Record<string, MedicalCondition> = {
  type2_diabetes: {
    name: 'Type 2 Diabetes Mellitus',
    icd10: 'E11',
    category: 'Endocrine',
    description: 'Chronic metabolic disorder characterized by insulin resistance and relative insulin deficiency',
    commonSymptoms: [
      'Increased thirst (polydipsia)',
      'Frequent urination (polyuria)',
      'Fatigue',
      'Blurred vision',
      'Slow wound healing',
      'Numbness in extremities',
    ],
    redFlags: [
      'Blood glucose >400 mg/dL with confusion',
      'Chest pain or shortness of breath',
      'Severe dehydration',
      'Fruity breath odor (ketoacidosis)',
      'Unresponsiveness',
      'New foot ulcer or wound',
    ],
    managementGoals: [
      'A1C <7% (individualized)',
      'Fasting glucose 80-130 mg/dL',
      'Blood pressure <130/80',
      'LDL cholesterol <100 mg/dL',
    ],
    lifestyleFactors: ['Diet', 'Exercise', 'Weight management', 'Smoking cessation', 'Alcohol moderation'],
    monitoringMetrics: ['A1C', 'Fasting glucose', 'Blood pressure', 'Weight', 'Foot exams'],
    relatedConditions: ['Hypertension', 'Hyperlipidemia', 'Cardiovascular disease', 'Neuropathy', 'Nephropathy', 'Retinopathy'],
  },

  hypertension: {
    name: 'Hypertension',
    icd10: 'I10',
    category: 'Cardiovascular',
    description: 'Persistently elevated arterial blood pressure',
    commonSymptoms: [
      'Often asymptomatic',
      'Headaches (severe cases)',
      'Shortness of breath',
      'Nosebleeds',
      'Dizziness',
    ],
    redFlags: [
      'BP >180/120 with symptoms',
      'Chest pain',
      'Severe headache with confusion',
      'Vision changes',
      'Difficulty speaking',
      'Weakness on one side',
    ],
    managementGoals: [
      'BP <130/80 mmHg',
      'Reduce cardiovascular risk',
      'Prevent end-organ damage',
    ],
    lifestyleFactors: ['DASH diet', 'Sodium restriction', 'Exercise', 'Weight loss', 'Alcohol limitation', 'Stress management'],
    monitoringMetrics: ['Blood pressure', 'Heart rate', 'Kidney function', 'Electrolytes'],
    relatedConditions: ['Coronary artery disease', 'Stroke', 'Heart failure', 'Chronic kidney disease', 'Retinopathy'],
  },

  copd: {
    name: 'Chronic Obstructive Pulmonary Disease',
    icd10: 'J44',
    category: 'Respiratory',
    description: 'Progressive lung disease causing obstructed airflow',
    commonSymptoms: [
      'Chronic cough',
      'Shortness of breath with activity',
      'Wheezing',
      'Chest tightness',
      'Excess mucus production',
      'Fatigue',
    ],
    redFlags: [
      'Severe breathlessness at rest',
      'Confusion or drowsiness',
      'Blue lips or fingernails (cyanosis)',
      'Rapid heartbeat',
      'Fever with increased sputum',
      'Unable to speak in full sentences',
    ],
    managementGoals: [
      'Reduce symptoms',
      'Prevent exacerbations',
      'Maintain lung function',
      'Improve quality of life',
    ],
    lifestyleFactors: ['Smoking cessation', 'Avoid triggers', 'Pulmonary rehabilitation', 'Vaccinations'],
    monitoringMetrics: ['Oxygen saturation', 'Peak flow', 'Spirometry', 'Exacerbation frequency'],
    relatedConditions: ['Heart failure', 'Lung cancer', 'Pulmonary hypertension', 'Anxiety', 'Depression'],
  },

  heart_failure: {
    name: 'Congestive Heart Failure',
    icd10: 'I50',
    category: 'Cardiovascular',
    description: 'Heart cannot pump blood efficiently to meet body needs',
    commonSymptoms: [
      'Shortness of breath (especially lying down)',
      'Fatigue and weakness',
      'Swelling in legs/ankles/feet',
      'Rapid or irregular heartbeat',
      'Reduced exercise tolerance',
      'Persistent cough',
      'Weight gain (fluid)',
    ],
    redFlags: [
      'Sudden severe shortness of breath',
      'Chest pain',
      'Fainting',
      'Rapid weight gain (>3 lbs in a day)',
      'Coughing pink, foamy mucus',
      'New or worsening confusion',
    ],
    managementGoals: [
      'Control symptoms',
      'Prevent hospitalizations',
      'Daily weight monitoring',
      'Fluid restriction if advised',
      'Low sodium diet',
    ],
    lifestyleFactors: ['Salt restriction', 'Fluid management', 'Daily weights', 'Exercise as tolerated', 'Medication adherence'],
    monitoringMetrics: ['Daily weight', 'Blood pressure', 'Heart rate', 'BNP levels', 'Kidney function'],
    relatedConditions: ['Coronary artery disease', 'Atrial fibrillation', 'Hypertension', 'Diabetes'],
  },

  chronic_kidney_disease: {
    name: 'Chronic Kidney Disease',
    icd10: 'N18',
    category: 'Renal',
    description: 'Gradual loss of kidney function over time',
    commonSymptoms: [
      'Often asymptomatic early',
      'Fatigue',
      'Swelling (edema)',
      'Changes in urination',
      'Nausea',
      'Loss of appetite',
      'Difficulty concentrating',
    ],
    redFlags: [
      'Severe swelling',
      'Difficulty breathing',
      'Confusion',
      'Chest pain',
      'Severe nausea/vomiting',
      'Very dark or bloody urine',
    ],
    managementGoals: [
      'Slow progression',
      'Control blood pressure',
      'Manage diabetes if present',
      'Protect remaining kidney function',
    ],
    lifestyleFactors: ['Blood pressure control', 'Diabetes management', 'Low protein diet (advanced stages)', 'Avoid NSAIDs', 'Stay hydrated'],
    monitoringMetrics: ['eGFR', 'Creatinine', 'Blood pressure', 'Urine protein', 'Potassium'],
    relatedConditions: ['Diabetes', 'Hypertension', 'Cardiovascular disease', 'Anemia'],
  },

  depression: {
    name: 'Major Depressive Disorder',
    icd10: 'F32',
    category: 'Mental Health',
    description: 'Persistent feelings of sadness and loss of interest affecting daily functioning',
    commonSymptoms: [
      'Persistent sad or empty mood',
      'Loss of interest in activities',
      'Sleep changes',
      'Fatigue',
      'Feelings of worthlessness',
      'Difficulty concentrating',
      'Appetite changes',
    ],
    redFlags: [
      'Thoughts of self-harm or suicide',
      'Giving away possessions',
      'Talking about being a burden',
      'Sudden calmness after depression',
      'Saying goodbye to people',
      'Obtaining means to hurt oneself',
    ],
    managementGoals: [
      'Improve mood',
      'Restore functioning',
      'Prevent recurrence',
      'Ensure safety',
    ],
    lifestyleFactors: ['Regular sleep', 'Physical activity', 'Social connection', 'Stress management', 'Avoiding alcohol'],
    monitoringMetrics: ['PHQ-9 scores', 'Sleep quality', 'Social engagement', 'Medication side effects'],
    relatedConditions: ['Anxiety', 'Chronic pain', 'Substance use', 'Medical conditions'],
  },

  anxiety: {
    name: 'Generalized Anxiety Disorder',
    icd10: 'F41.1',
    category: 'Mental Health',
    description: 'Excessive worry and anxiety about various life events',
    commonSymptoms: [
      'Excessive worry',
      'Restlessness',
      'Fatigue',
      'Difficulty concentrating',
      'Muscle tension',
      'Sleep problems',
      'Irritability',
    ],
    redFlags: [
      'Panic attacks with chest pain',
      'Thoughts of self-harm',
      'Inability to function',
      'Substance abuse to cope',
      'Complete withdrawal from activities',
    ],
    managementGoals: [
      'Reduce worry',
      'Improve coping skills',
      'Maintain daily functioning',
      'Address underlying causes',
    ],
    lifestyleFactors: ['Regular exercise', 'Sleep hygiene', 'Limit caffeine', 'Relaxation techniques', 'Mindfulness'],
    monitoringMetrics: ['GAD-7 scores', 'Sleep quality', 'Functional status'],
    relatedConditions: ['Depression', 'Panic disorder', 'PTSD', 'Insomnia'],
  },
};

// ============================================
// Common Medications Reference
// ============================================

export interface Medication {
  name: string;
  genericName: string;
  class: string;
  commonUses: string[];
  commonSideEffects: string[];
  seriousSideEffects: string[];
  importantInteractions: string[];
  patientCounseling: string[];
  monitoringRequired: string[];
}

export const COMMON_MEDICATIONS: Record<string, Medication> = {
  metformin: {
    name: 'Metformin (Glucophage)',
    genericName: 'metformin',
    class: 'Biguanide',
    commonUses: ['Type 2 diabetes', 'Prediabetes', 'PCOS'],
    commonSideEffects: ['GI upset', 'Nausea', 'Diarrhea', 'Metallic taste'],
    seriousSideEffects: ['Lactic acidosis (rare)', 'B12 deficiency (long-term)'],
    importantInteractions: ['Contrast dye (hold before/after)', 'Alcohol', 'Certain heart/kidney medications'],
    patientCounseling: [
      'Take with food to reduce GI side effects',
      'GI side effects often improve over time',
      'Stay hydrated',
      'Inform any doctor before procedures requiring contrast',
    ],
    monitoringRequired: ['Kidney function', 'B12 levels (annually)', 'Blood glucose'],
  },

  lisinopril: {
    name: 'Lisinopril (Zestril, Prinivil)',
    genericName: 'lisinopril',
    class: 'ACE Inhibitor',
    commonUses: ['Hypertension', 'Heart failure', 'Diabetic nephropathy', 'Post-MI'],
    commonSideEffects: ['Dry cough', 'Dizziness', 'Headache', 'Fatigue'],
    seriousSideEffects: ['Angioedema (swelling)', 'High potassium', 'Kidney problems'],
    importantInteractions: ['NSAIDs', 'Potassium supplements', 'Potassium-sparing diuretics'],
    patientCounseling: [
      'Dry cough is common - report if bothersome',
      'Rise slowly to prevent dizziness',
      'Avoid potassium supplements unless directed',
      'Do not use if pregnant',
    ],
    monitoringRequired: ['Blood pressure', 'Kidney function', 'Potassium'],
  },

  atorvastatin: {
    name: 'Atorvastatin (Lipitor)',
    genericName: 'atorvastatin',
    class: 'Statin',
    commonUses: ['High cholesterol', 'Cardiovascular prevention'],
    commonSideEffects: ['Muscle aches', 'GI upset', 'Headache'],
    seriousSideEffects: ['Rhabdomyolysis (rare)', 'Liver problems (rare)', 'New-onset diabetes'],
    importantInteractions: ['Grapefruit juice', 'Certain antibiotics', 'Other cholesterol medications'],
    patientCounseling: [
      'Report unexplained muscle pain or weakness',
      'Avoid large amounts of grapefruit juice',
      'Take at the same time daily',
      'Continue even if cholesterol improves - for prevention',
    ],
    monitoringRequired: ['Lipid panel', 'Liver function (baseline)', 'Muscle symptoms'],
  },

  amlodipine: {
    name: 'Amlodipine (Norvasc)',
    genericName: 'amlodipine',
    class: 'Calcium Channel Blocker',
    commonUses: ['Hypertension', 'Angina'],
    commonSideEffects: ['Ankle swelling', 'Flushing', 'Headache', 'Dizziness'],
    seriousSideEffects: ['Severe hypotension', 'Worsening heart failure (rare)'],
    importantInteractions: ['Grapefruit juice', 'CYP3A4 inhibitors'],
    patientCounseling: [
      'Ankle swelling is common - elevate legs when possible',
      'Takes 1-2 weeks to see full effect',
      'Don\'t stop suddenly',
    ],
    monitoringRequired: ['Blood pressure', 'Heart rate'],
  },

  omeprazole: {
    name: 'Omeprazole (Prilosec)',
    genericName: 'omeprazole',
    class: 'Proton Pump Inhibitor',
    commonUses: ['GERD', 'Ulcers', 'H. pylori (with antibiotics)'],
    commonSideEffects: ['Headache', 'Nausea', 'Diarrhea', 'Abdominal pain'],
    seriousSideEffects: ['C. diff infection', 'Bone fractures (long-term)', 'B12/magnesium deficiency', 'Kidney problems'],
    importantInteractions: ['Clopidogrel (Plavix)', 'Methotrexate'],
    patientCounseling: [
      'Take 30-60 minutes before meals',
      'Long-term use should be discussed with doctor',
      'Report signs of infection',
    ],
    monitoringRequired: ['Magnesium (long-term)', 'B12 (long-term)', 'Bone density (long-term)'],
  },

  sertraline: {
    name: 'Sertraline (Zoloft)',
    genericName: 'sertraline',
    class: 'SSRI',
    commonUses: ['Depression', 'Anxiety', 'PTSD', 'OCD', 'Panic disorder'],
    commonSideEffects: ['Nausea', 'Headache', 'Insomnia', 'Sexual dysfunction', 'Diarrhea'],
    seriousSideEffects: ['Serotonin syndrome', 'Suicidal thoughts (young adults)', 'Bleeding risk', 'Withdrawal symptoms'],
    importantInteractions: ['MAOIs', 'Blood thinners', 'Other serotonergic drugs', 'NSAIDs'],
    patientCounseling: [
      'Takes 2-4 weeks to feel full effect',
      'Don\'t stop suddenly - taper with doctor',
      'Report worsening mood or suicidal thoughts immediately',
      'Avoid alcohol',
    ],
    monitoringRequired: ['Mood', 'Side effects', 'Suicidal ideation (especially early)'],
  },

  albuterol: {
    name: 'Albuterol (ProAir, Ventolin)',
    genericName: 'albuterol',
    class: 'Short-acting Beta Agonist',
    commonUses: ['Asthma', 'COPD', 'Bronchospasm'],
    commonSideEffects: ['Tremor', 'Rapid heartbeat', 'Nervousness', 'Headache'],
    seriousSideEffects: ['Paradoxical bronchospasm', 'Severe allergic reaction', 'Hypokalemia'],
    importantInteractions: ['Beta-blockers', 'Diuretics', 'Other bronchodilators'],
    patientCounseling: [
      'Use as rescue medication for acute symptoms',
      'If needing more than 2x/week, controller medication may be needed',
      'Shake inhaler before use',
      'Wait 1 minute between puffs',
    ],
    monitoringRequired: ['Frequency of use', 'Peak flow', 'Heart rate'],
  },
};

// ============================================
// Symptom Analysis Patterns
// ============================================

export interface SymptomPattern {
  keywords: string[];
  possibleConcerns: string[];
  urgencyLevel: 'routine' | 'soon' | 'urgent' | 'emergency';
  followUpQuestions: string[];
  recommendedAction: string;
}

export const SYMPTOM_PATTERNS: SymptomPattern[] = [
  // Cardiac symptoms
  {
    keywords: ['chest pain', 'chest tightness', 'pressure in chest', 'heart racing', 'heart pounding'],
    possibleConcerns: ['Cardiac event', 'Angina', 'Anxiety', 'GERD'],
    urgencyLevel: 'urgent',
    followUpQuestions: [
      'When did this start?',
      'Does it go down your arm or to your jaw?',
      'Are you short of breath?',
      'Are you sweating or nauseous?',
      'What makes it better or worse?',
    ],
    recommendedAction: 'If severe or with other symptoms, call 911. Otherwise contact your care team today.',
  },

  // Respiratory symptoms
  {
    keywords: ['can\'t breathe', 'hard to breathe', 'short of breath', 'gasping', 'choking'],
    possibleConcerns: ['Respiratory distress', 'Asthma attack', 'COPD exacerbation', 'Anxiety'],
    urgencyLevel: 'urgent',
    followUpQuestions: [
      'Is this sudden or gradual?',
      'Can you speak in full sentences?',
      'What were you doing when it started?',
      'Do you have a rescue inhaler?',
    ],
    recommendedAction: 'If severe, call 911. If you have a rescue inhaler, use it. Contact your care team immediately.',
  },

  // Blood sugar concerns
  {
    keywords: ['sugar is high', 'glucose high', 'blood sugar', 'feeling shaky', 'dizzy', 'sweating'],
    possibleConcerns: ['Hypoglycemia', 'Hyperglycemia', 'Medication adjustment needed'],
    urgencyLevel: 'soon',
    followUpQuestions: [
      'What is your current blood sugar reading?',
      'When did you last eat?',
      'Did you take your diabetes medication?',
      'Are you feeling confused?',
    ],
    recommendedAction: 'If very low (<70), eat fast-acting sugar. If very high (>400), contact your care team urgently.',
  },

  // Mental health crisis
  {
    keywords: ['want to die', 'kill myself', 'suicidal', 'no reason to live', 'better off dead', 'end it all'],
    possibleConcerns: ['Suicidal ideation', 'Mental health crisis'],
    urgencyLevel: 'emergency',
    followUpQuestions: [
      'Are you safe right now?',
      'Do you have a plan to hurt yourself?',
      'Is there someone with you?',
    ],
    recommendedAction: 'Call 988 (Suicide Lifeline) or 911 immediately. Do not leave yourself alone.',
  },

  // Medication concerns
  {
    keywords: ['missed dose', 'forgot medication', 'ran out of', 'side effect', 'bad reaction'],
    possibleConcerns: ['Medication non-adherence', 'Adverse drug reaction'],
    urgencyLevel: 'soon',
    followUpQuestions: [
      'Which medication are you referring to?',
      'How many doses have you missed?',
      'What symptoms are you experiencing?',
      'When did this start?',
    ],
    recommendedAction: 'Don\'t double up on doses. Contact your care team for guidance.',
  },

  // Infection symptoms
  {
    keywords: ['fever', 'chills', 'infection', 'wound looks bad', 'red and swollen'],
    possibleConcerns: ['Infection', 'Sepsis (if severe)'],
    urgencyLevel: 'soon',
    followUpQuestions: [
      'What is your temperature?',
      'How long have you had fever?',
      'Do you have any wounds or recent surgery?',
      'Are you feeling confused?',
    ],
    recommendedAction: 'Monitor temperature. Seek urgent care if fever >101.3°F with other symptoms.',
  },

  // GI symptoms
  {
    keywords: ['vomiting blood', 'bloody stool', 'black stool', 'severe abdominal pain'],
    possibleConcerns: ['GI bleeding', 'Ulcer', 'Serious GI condition'],
    urgencyLevel: 'urgent',
    followUpQuestions: [
      'How much blood?',
      'When did this start?',
      'Are you on blood thinners?',
      'Do you have abdominal pain?',
    ],
    recommendedAction: 'This needs immediate evaluation. Go to the ER.',
  },

  // Pain
  {
    keywords: ['pain', 'hurts', 'aching', 'sore'],
    possibleConcerns: ['Varies by location and severity'],
    urgencyLevel: 'routine',
    followUpQuestions: [
      'Where is the pain located?',
      'On a scale of 1-10, how bad is it?',
      'When did it start?',
      'What makes it better or worse?',
      'Is it constant or does it come and go?',
    ],
    recommendedAction: 'Pain management strategies depend on cause. Share these details with your care team.',
  },

  // General wellness
  {
    keywords: ['tired', 'fatigue', 'no energy', 'exhausted', 'weak'],
    possibleConcerns: ['Multiple possible causes - dehydration, anemia, thyroid, depression, medication side effects'],
    urgencyLevel: 'routine',
    followUpQuestions: [
      'How long have you been feeling this way?',
      'How are you sleeping?',
      'Have you had any changes in appetite?',
      'Are you staying hydrated?',
    ],
    recommendedAction: 'Monitor and report to care team at next visit unless severe or sudden.',
  },
];

// ============================================
// Clinical Reasoning Helper
// ============================================

export function analyzeSymptoms(message: string): {
  detectedPatterns: SymptomPattern[];
  highestUrgency: 'routine' | 'soon' | 'urgent' | 'emergency';
  suggestedQuestions: string[];
} {
  const lowerMessage = message.toLowerCase();
  const detectedPatterns: SymptomPattern[] = [];

  for (const pattern of SYMPTOM_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        detectedPatterns.push(pattern);
        break;
      }
    }
  }

  // Determine highest urgency
  const urgencyOrder = ['routine', 'soon', 'urgent', 'emergency'];
  let highestUrgency: 'routine' | 'soon' | 'urgent' | 'emergency' = 'routine';

  for (const pattern of detectedPatterns) {
    if (urgencyOrder.indexOf(pattern.urgencyLevel) > urgencyOrder.indexOf(highestUrgency)) {
      highestUrgency = pattern.urgencyLevel;
    }
  }

  // Collect suggested questions
  const suggestedQuestions = detectedPatterns.flatMap(p => p.followUpQuestions);
  const uniqueQuestions = [...new Set(suggestedQuestions)].slice(0, 5);

  return {
    detectedPatterns,
    highestUrgency,
    suggestedQuestions: uniqueQuestions,
  };
}

// ============================================
// Get condition context for a patient
// ============================================

export function getConditionContext(conditionNames: string[]): string {
  const contexts: string[] = [];

  for (const name of conditionNames) {
    // Try to match condition name to our database
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const condition = COMMON_CONDITIONS[normalizedName];

    if (condition) {
      contexts.push(`
${condition.name}:
- Common symptoms to watch for: ${condition.commonSymptoms.slice(0, 4).join(', ')}
- Red flags requiring immediate attention: ${condition.redFlags.slice(0, 3).join('; ')}
- Management goals: ${condition.managementGoals.slice(0, 2).join(', ')}
- Key lifestyle factors: ${condition.lifestyleFactors.slice(0, 3).join(', ')}`);
    } else {
      contexts.push(`\n${name}: (Use general medical knowledge)`);
    }
  }

  return contexts.join('\n');
}

// ============================================
// Get medication context
// ============================================

export function getMedicationContext(medicationNames: string[]): string {
  const contexts: string[] = [];

  for (const name of medicationNames) {
    // Try to match medication name
    const normalizedName = name.toLowerCase().split(' ')[0]; // Get first word (generic name)
    const medication = COMMON_MEDICATIONS[normalizedName];

    if (medication) {
      contexts.push(`
${medication.name}:
- Common side effects: ${medication.commonSideEffects.slice(0, 3).join(', ')}
- Important: ${medication.patientCounseling.slice(0, 2).join('; ')}`);
    } else {
      contexts.push(`\n${name}: (Standard medication counseling applies)`);
    }
  }

  return contexts.join('\n');
}

// ============================================
// Crisis Resources
// ============================================

export const CRISIS_RESOURCES = {
  suicide: {
    name: 'National Suicide Prevention Lifeline',
    number: '988',
    text: 'Text HOME to 741741',
    description: 'Free, confidential support 24/7',
  },
  poison: {
    name: 'Poison Control Center',
    number: '1-800-222-1222',
    description: 'For poisoning emergencies and questions',
  },
  emergency: {
    name: 'Emergency Services',
    number: '911',
    description: 'For life-threatening emergencies',
  },
  domesticViolence: {
    name: 'National Domestic Violence Hotline',
    number: '1-800-799-7233',
    description: 'Support for domestic violence situations',
  },
};

export function getCrisisResourcesText(): string {
  return `
CRISIS RESOURCES:
• Suicide/Mental Health Crisis: Call 988 or text HOME to 741741
• Poison Control: 1-800-222-1222
• Emergency: Call 911
• Domestic Violence: 1-800-799-7233

You are not alone. Help is available 24/7.`;
}
