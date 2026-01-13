/**
 * Skill Types
 * Type definitions for Albert's skill authoring system.
 * Skills are multi-step workflows that chain existing voice tools together.
 */

// ============================================
// Core Skill Types
// ============================================

export type SkillStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export type ParameterSource = 'input' | 'previous_step' | 'context' | 'constant';

/**
 * Parameter mapping for skill steps
 * Defines how to get values for tool parameters
 */
export interface SkillParameter {
  /** Where the value comes from */
  source: ParameterSource;
  /**
   * The value or path to the value:
   * - 'input': path in input data (e.g., "recipe", "query")
   * - 'previous_step': template with step output keys (e.g., "{{research.summary}}")
   * - 'context': path in execution context
   * - 'constant': literal value
   */
  value: string;
  /** Optional transformation to apply (future feature) */
  transform?: string;
}

/**
 * A single step in a skill workflow
 */
export interface SkillStep {
  id: string;
  skillId: string;
  /** Order of execution (0-indexed) */
  order: number;
  /** Human-readable step name */
  name: string;
  /** Optional description */
  description?: string;
  /** The tool to execute (must exist in buildTools) */
  toolName: string;
  /** Maps tool parameter names to their sources */
  parameterMapping: Record<string, SkillParameter>;
  /** Optional condition for execution (JS expression) */
  condition?: string;
  /** Step ID to jump to on success (default: next step) */
  onSuccess?: string;
  /** Step ID to jump to on failure */
  onFailure?: string;
  /** Number of retry attempts on failure */
  retryCount: number;
  /** Key to store this step's output in results */
  outputKey: string;
  /** Fields to extract from the output (empty = keep all) */
  extractFields: string[];
}

/**
 * A saved skill/workflow
 */
export interface AlbertSkill {
  id: string;
  /** Human-readable name */
  name: string;
  /** URL-safe identifier for triggers */
  slug: string;
  /** Description for discovery and AI matching */
  description: string;
  /** Semantic version */
  version: string;
  /** Markdown instructions for complex logic */
  instructions: string;
  /** Additional context for execution */
  systemContext?: string;
  /** Natural language phrases that trigger this skill */
  triggers: string[];
  /** Tools this skill is allowed to use */
  allowedTools: string[];
  /** Tools that must be available for this skill */
  requiredTools: string[];
  /** Other skill IDs this depends on */
  dependsOn: string[];
  /** Whether the skill is enabled */
  isActive: boolean;
  /** How the skill was created */
  createdBy: 'voice' | 'manual' | 'import';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Full skill with its steps loaded
 */
export interface AlbertSkillWithSteps extends AlbertSkill {
  steps: SkillStep[];
}

// ============================================
// Execution Types
// ============================================

/**
 * A skill execution instance
 */
export interface SkillExecution {
  id: string;
  skillId: string;
  status: SkillStatus;
  /** Current step being executed */
  currentStepId?: string;
  /** Input data provided when execution started */
  inputData: Record<string, unknown>;
  /** Results from each step, keyed by outputKey */
  stepResults: Record<string, unknown>;
  /** Accumulated context during execution */
  context: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Progress event emitted during skill execution
 */
export interface SkillProgressEvent {
  executionId: string;
  skillId: string;
  skillName: string;
  status: SkillStatus;
  currentStep?: {
    id: string;
    name: string;
    order: number;
    totalSteps: number;
  };
  /** Human-readable progress message */
  message: string;
  timestamp: string;
  /** Result from the current step (if available) */
  result?: unknown;
}

// ============================================
// Matching Types
// ============================================

/**
 * Result from skill matching
 */
export interface SkillMatchResult {
  skill: AlbertSkill;
  /** Confidence score (0-1) */
  confidence: number;
  /** Which trigger phrase matched (if any) */
  matchedTrigger?: string;
}

// ============================================
// Creation Types
// ============================================

/**
 * Draft skill from voice creation (before full processing)
 */
export interface SkillDraft {
  name: string;
  description: string;
  triggers: string[];
  steps: SkillStepDraft[];
}

/**
 * Draft step from voice creation
 */
export interface SkillStepDraft {
  /** Natural language description of what to do */
  description: string;
  /** Tool to use (may need to be resolved) */
  toolName?: string;
  /** Raw parameter values */
  parameters?: Record<string, string>;
}

/**
 * Input for creating a skill via API
 */
export interface CreateSkillInput {
  name: string;
  description: string;
  triggers: string[];
  steps: Array<{
    name: string;
    description?: string;
    toolName: string;
    parameterMapping: Record<string, SkillParameter>;
    outputKey: string;
    condition?: string;
    onSuccess?: string;
    onFailure?: string;
    retryCount?: number;
    extractFields?: string[];
  }>;
  instructions?: string;
  allowedTools?: string[];
}

/**
 * Input for updating a skill
 */
export interface UpdateSkillInput {
  name?: string;
  description?: string;
  triggers?: string[];
  instructions?: string;
  isActive?: boolean;
  allowedTools?: string[];
}

/**
 * Input for creating a skill step
 */
export interface CreateSkillStepInput {
  name: string;
  description?: string;
  toolName: string;
  parameterMapping: Record<string, SkillParameter>;
  outputKey: string;
  order?: number;
  condition?: string;
  onSuccess?: string;
  onFailure?: string;
  retryCount?: number;
  extractFields?: string[];
}

// ============================================
// API Response Types
// ============================================

export interface SkillApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ListSkillsResponse {
  skills: AlbertSkill[];
  total: number;
}

export interface ExecuteSkillResponse {
  executionId: string;
  skillId: string;
  skillName: string;
  message: string;
}

export interface MatchSkillsResponse {
  matches: SkillMatchResult[];
  bestMatch?: SkillMatchResult;
}
