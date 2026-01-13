/**
 * Skill Store
 * Manages skill executions with database persistence and EventEmitter for real-time updates.
 * Pattern follows researchSessionStore.ts and buildOrchestrator.ts
 */

import { EventEmitter } from 'events';
import {
  getSkillExecution,
  updateSkillExecution,
  createSkillExecution,
  getSkillWithSteps,
} from '@/lib/db';
import type {
  SkillExecution,
  SkillProgressEvent,
  SkillStatus,
  AlbertSkillWithSteps,
} from '@/types/skill';

// Event emitter for real-time progress updates (used by SSE endpoints)
const skillEvents = new EventEmitter();
skillEvents.setMaxListeners(100);

// In-memory cache for active executions
const activeExecutionsCache = new Map<string, SkillExecution>();

// Track the current execution ID for voice interface (only one at a time)
let currentExecutionId: string | null = null;

// ============================================
// Execution Creation & Retrieval
// ============================================

/**
 * Create a new skill execution
 */
export async function startSkillExecution(
  skillId: string,
  inputData: Record<string, unknown> = {}
): Promise<{ executionId: string; skill: AlbertSkillWithSteps }> {
  // Get skill with steps
  const skill = await getSkillWithSteps(skillId);
  if (!skill) {
    throw new Error(`Skill ${skillId} not found`);
  }

  if (!skill.isActive) {
    throw new Error(`Skill "${skill.name}" is inactive`);
  }

  if (skill.steps.length === 0) {
    throw new Error(`Skill "${skill.name}" has no steps`);
  }

  // Create execution in database
  const executionId = await createSkillExecution(skillId, inputData);

  // Build execution object
  const execution: SkillExecution = {
    id: executionId,
    skillId,
    status: 'pending',
    inputData,
    stepResults: {},
    context: {},
    startedAt: new Date(),
  };

  // Cache in memory
  activeExecutionsCache.set(executionId, execution);
  currentExecutionId = executionId;

  console.log(`[SkillStore] Created execution ${executionId} for skill "${skill.name}"`);

  return { executionId, skill };
}

/**
 * Get a skill execution by ID (checks cache first, then database)
 */
export async function getExecutionById(executionId: string): Promise<SkillExecution | null> {
  // Check cache first
  const cached = activeExecutionsCache.get(executionId);
  if (cached) return cached;

  // Load from database
  const dbExecution = await getSkillExecution(executionId);
  if (!dbExecution) return null;

  // Convert to SkillExecution format
  const execution: SkillExecution = {
    id: dbExecution.id,
    skillId: dbExecution.skillId,
    status: dbExecution.status as SkillStatus,
    currentStepId: dbExecution.currentStepId || undefined,
    inputData: dbExecution.inputData,
    stepResults: dbExecution.stepResults,
    context: {},
    error: dbExecution.error || undefined,
    startedAt: dbExecution.startedAt,
    completedAt: dbExecution.completedAt || undefined,
  };

  // Cache if running
  if (execution.status === 'running' || execution.status === 'pending') {
    activeExecutionsCache.set(executionId, execution);
  }

  return execution;
}

/**
 * Get the current active skill execution for voice interface
 */
export async function getActiveExecution(): Promise<SkillExecution | null> {
  if (!currentExecutionId) return null;

  const execution = await getExecutionById(currentExecutionId);
  if (execution && (execution.status === 'running' || execution.status === 'pending')) {
    return execution;
  }

  currentExecutionId = null;
  return null;
}

// ============================================
// Execution Updates
// ============================================

/**
 * Update execution status and emit progress event
 */
export async function updateExecutionStatus(
  executionId: string,
  status: SkillStatus,
  updates: {
    currentStepId?: string;
    stepResults?: Record<string, unknown>;
    error?: string;
  } = {}
): Promise<void> {
  // Update database
  await updateSkillExecution(executionId, {
    status,
    currentStepId: updates.currentStepId,
    stepResults: updates.stepResults,
    error: updates.error,
  });

  // Update cache
  const cached = activeExecutionsCache.get(executionId);
  if (cached) {
    cached.status = status;
    if (updates.currentStepId) cached.currentStepId = updates.currentStepId;
    if (updates.stepResults) cached.stepResults = { ...cached.stepResults, ...updates.stepResults };
    if (updates.error) cached.error = updates.error;
    if (status === 'completed' || status === 'failed') {
      cached.completedAt = new Date();
    }
  }
}

/**
 * Mark execution as running with first step
 */
export async function markExecutionRunning(
  executionId: string,
  firstStepId: string
): Promise<void> {
  await updateExecutionStatus(executionId, 'running', { currentStepId: firstStepId });
}

/**
 * Mark execution as completed
 */
export async function markExecutionCompleted(
  executionId: string,
  results: Record<string, unknown>
): Promise<void> {
  await updateExecutionStatus(executionId, 'completed', { stepResults: results });

  // Clean up after delay
  setTimeout(() => {
    activeExecutionsCache.delete(executionId);
    if (currentExecutionId === executionId) {
      currentExecutionId = null;
    }
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Mark execution as failed
 */
export async function markExecutionFailed(
  executionId: string,
  error: string
): Promise<void> {
  await updateExecutionStatus(executionId, 'failed', { error });

  if (currentExecutionId === executionId) {
    currentExecutionId = null;
  }
}

/**
 * Update step results
 */
export async function saveStepResult(
  executionId: string,
  stepId: string,
  outputKey: string,
  result: unknown
): Promise<void> {
  const cached = activeExecutionsCache.get(executionId);
  if (cached) {
    cached.stepResults[outputKey] = result;
    await updateExecutionStatus(executionId, cached.status, {
      currentStepId: stepId,
      stepResults: cached.stepResults,
    });
  }
}

// ============================================
// Event System (for SSE streaming)
// ============================================

/**
 * Subscribe to skill execution progress events
 */
export function subscribeToSkillProgress(
  executionId: string,
  callback: (event: SkillProgressEvent) => void
): () => void {
  const eventName = `progress:${executionId}`;
  skillEvents.on(eventName, callback);

  return () => {
    skillEvents.off(eventName, callback);
  };
}

/**
 * Emit a skill progress event
 */
export function emitSkillProgress(
  executionId: string,
  event: Omit<SkillProgressEvent, 'timestamp'>
): void {
  const fullEvent: SkillProgressEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  skillEvents.emit(`progress:${executionId}`, fullEvent);
  console.log(`[SkillStore] Progress: ${event.status} - ${event.message.slice(0, 100)}`);
}

/**
 * Emit a step progress event
 */
export function emitStepProgress(
  executionId: string,
  skillId: string,
  skillName: string,
  step: { id: string; name: string; order: number; totalSteps: number },
  message: string,
  result?: unknown
): void {
  emitSkillProgress(executionId, {
    executionId,
    skillId,
    skillName,
    status: 'running',
    currentStep: step,
    message,
    result,
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get all active execution IDs (from cache)
 */
export function getAllActiveExecutionIds(): string[] {
  return Array.from(activeExecutionsCache.keys());
}

/**
 * Check if there's an active execution
 */
export function hasActiveExecution(): boolean {
  return currentExecutionId !== null;
}

/**
 * Clear the current execution (for cleanup)
 */
export function clearCurrentExecution(): void {
  currentExecutionId = null;
}
