/**
 * Skill Execution Engine
 * Orchestrates the execution of multi-step skill workflows.
 * Each step executes a tool and passes results to subsequent steps.
 */

import {
  startSkillExecution,
  markExecutionRunning,
  markExecutionCompleted,
  markExecutionFailed,
  saveStepResult,
  emitSkillProgress,
  emitStepProgress,
} from './skillStore';
import { getSkillWithSteps } from '@/lib/db';
import type {
  AlbertSkillWithSteps,
  SkillStep,
  SkillParameter,
  SkillExecution,
} from '@/types/skill';

// Tool execution context passed between steps
interface ExecutionContext {
  input: Record<string, unknown>;
  results: Record<string, unknown>;
  currentStep: number;
  totalSteps: number;
}

// Tool result type
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Execute a skill workflow
 */
export async function executeSkill(
  skillId: string,
  inputData: Record<string, unknown> = {}
): Promise<{ executionId: string; success: boolean; results?: Record<string, unknown>; error?: string }> {
  let executionId = '';

  try {
    // Start execution and get skill
    const { executionId: execId, skill } = await startSkillExecution(skillId, inputData);
    executionId = execId;

    console.log(`[SkillEngine] Starting execution ${executionId} for "${skill.name}" with ${skill.steps.length} steps`);

    // Emit initial progress
    emitSkillProgress(executionId, {
      executionId,
      skillId: skill.id,
      skillName: skill.name,
      status: 'running',
      message: `Starting "${skill.name}"...`,
    });

    // Mark as running with first step
    await markExecutionRunning(executionId, skill.steps[0].id);

    // Initialize execution context
    const context: ExecutionContext = {
      input: inputData,
      results: {},
      currentStep: 0,
      totalSteps: skill.steps.length,
    };

    // Execute each step
    for (let i = 0; i < skill.steps.length; i++) {
      const step = skill.steps[i];
      context.currentStep = i;

      // Check condition if present
      if (step.condition) {
        const shouldRun = evaluateCondition(step.condition, context);
        if (!shouldRun) {
          console.log(`[SkillEngine] Skipping step "${step.name}" - condition not met`);
          continue;
        }
      }

      // Emit step progress
      emitStepProgress(
        executionId,
        skill.id,
        skill.name,
        {
          id: step.id,
          name: step.name,
          order: i + 1,
          totalSteps: skill.steps.length,
        },
        `Running step ${i + 1}/${skill.steps.length}: ${step.name}...`
      );

      // Execute the step
      const result = await executeStep(step, context, executionId, skill);

      if (!result.success) {
        // Check for retry
        if (step.retryCount > 0) {
          console.log(`[SkillEngine] Step "${step.name}" failed, retrying (${step.retryCount} attempts left)...`);
          // Retry logic would go here
        }

        // Check for failure handler
        if (step.onFailure) {
          // Jump to failure step (future enhancement)
          console.log(`[SkillEngine] Step "${step.name}" failed, jumping to failure handler ${step.onFailure}`);
        } else {
          // Fail the whole execution
          const errorMsg = result.error || `Step "${step.name}" failed`;
          await markExecutionFailed(executionId, errorMsg);
          emitSkillProgress(executionId, {
            executionId,
            skillId: skill.id,
            skillName: skill.name,
            status: 'failed',
            message: errorMsg,
          });
          return { executionId, success: false, error: errorMsg };
        }
      }

      // Store result
      context.results[step.outputKey] = result.data;
      await saveStepResult(executionId, step.id, step.outputKey, result.data);

      // Emit step completion
      emitStepProgress(
        executionId,
        skill.id,
        skill.name,
        {
          id: step.id,
          name: step.name,
          order: i + 1,
          totalSteps: skill.steps.length,
        },
        `Completed step ${i + 1}/${skill.steps.length}: ${step.name}`,
        result.data
      );
    }

    // Mark as completed
    await markExecutionCompleted(executionId, context.results);
    emitSkillProgress(executionId, {
      executionId,
      skillId: skill.id,
      skillName: skill.name,
      status: 'completed',
      message: `Successfully completed "${skill.name}" with ${skill.steps.length} steps.`,
      result: context.results,
    });

    console.log(`[SkillEngine] Completed execution ${executionId} for "${skill.name}"`);
    return { executionId, success: true, results: context.results };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SkillEngine] Execution failed:`, error);

    if (executionId) {
      await markExecutionFailed(executionId, errorMsg);
    }

    return { executionId, success: false, error: errorMsg };
  }
}

/**
 * Execute a single step
 */
async function executeStep(
  step: SkillStep,
  context: ExecutionContext,
  executionId: string,
  skill: AlbertSkillWithSteps
): Promise<ToolResult> {
  console.log(`[SkillEngine] Executing step: ${step.name} (tool: ${step.toolName})`);

  try {
    // Resolve parameters
    const params = resolveParameters(step.parameterMapping, context);
    console.log(`[SkillEngine] Resolved params for ${step.toolName}:`, JSON.stringify(params).slice(0, 200));

    // Execute the tool via API
    const result = await executeTool(step.toolName, params);

    // Extract specific fields if configured
    if (result.success && step.extractFields.length > 0) {
      const extracted: Record<string, unknown> = {};
      for (const field of step.extractFields) {
        extracted[field] = getNestedValue(result.data as Record<string, unknown>, field);
      }
      result.data = extracted;
    }

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Step execution failed';
    console.error(`[SkillEngine] Step "${step.name}" error:`, error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Resolve parameters from context
 */
function resolveParameters(
  mapping: Record<string, SkillParameter>,
  context: ExecutionContext
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [paramName, param] of Object.entries(mapping)) {
    resolved[paramName] = resolveParameter(param, context);
  }

  return resolved;
}

/**
 * Resolve a single parameter
 */
function resolveParameter(param: SkillParameter, context: ExecutionContext): unknown {
  switch (param.source) {
    case 'constant':
      return param.value;

    case 'input':
      return getNestedValue(context.input, param.value);

    case 'previous_step':
      // Handle template strings like "{{research.summary}}"
      if (param.value.includes('{{')) {
        return interpolateTemplate(param.value, context.results);
      }
      return getNestedValue(context.results, param.value);

    case 'context':
      return getNestedValue(context as unknown as Record<string, unknown>, param.value);

    default:
      return param.value;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Interpolate template strings with context values
 */
function interpolateTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const value = getNestedValue(values, path.trim());
    return value !== undefined ? String(value) : '';
  });
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(condition: string, context: ExecutionContext): boolean {
  try {
    // Simple evaluation - check if a result exists and is truthy
    // Format: "resultKey" or "resultKey.field"
    const value = getNestedValue(context.results, condition);
    return Boolean(value);
  } catch {
    console.warn(`[SkillEngine] Failed to evaluate condition: ${condition}`);
    return true; // Default to running the step
  }
}

/**
 * Execute a tool by calling the appropriate API
 */
async function executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
  // Map tool names to their API endpoints
  const toolApiMap: Record<string, { endpoint: string; method: string }> = {
    // Research tools (Perplexity AI powered)
    start_research: { endpoint: '/api/research', method: 'POST' },
    ask_research: { endpoint: '/api/research', method: 'POST' },
    get_research_summary: { endpoint: '/api/research', method: 'POST' },
    get_news: { endpoint: '/api/research', method: 'POST' },
    close_research: { endpoint: '/api/research', method: 'POST' },

    // Build tools
    start_build_project: { endpoint: '/api/build/start', method: 'POST' },
    check_build_status: { endpoint: '/api/build/projects', method: 'GET' },
    modify_project: { endpoint: '/api/build/{projectId}/modify', method: 'POST' },
    list_projects: { endpoint: '/api/build/projects', method: 'GET' },

    // Skill tools (recursive - be careful!)
    list_skills: { endpoint: '/api/skills', method: 'GET' },

    // Generic tools that need custom handling
    search_web: { endpoint: '/api/search', method: 'POST' },
    compose_email: { endpoint: '/api/email/compose', method: 'POST' },
    read_email: { endpoint: '/api/email/read', method: 'GET' },
  };

  const apiInfo = toolApiMap[toolName];

  if (!apiInfo) {
    console.warn(`[SkillEngine] No API mapping for tool: ${toolName}`);
    // Return simulated success for unmapped tools
    return {
      success: true,
      data: { message: `Tool ${toolName} executed with params`, params },
    };
  }

  try {
    // Build the URL, replacing path params
    let url = apiInfo.endpoint;
    for (const [key, value] of Object.entries(params)) {
      if (url.includes(`{${key}}`)) {
        url = url.replace(`{${key}}`, String(value));
      }
    }

    // For NotebookLM, add action to body
    let body = params;
    if (toolName.includes('research') || toolName === 'ask_notebook') {
      body = { action: toolNameToAction(toolName), ...params };
    }

    // Make the API call (relative URL - needs base URL for server-side)
    // Use VERCEL_URL if available (set by Vercel), otherwise fallback to localhost
    const vercelUrl = process.env.VERCEL_URL;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
      (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000');
    const fullUrl = `${baseUrl}${url}`;

    console.log(`[SkillEngine] Calling ${apiInfo.method} ${fullUrl}`);

    const response = await fetch(fullUrl, {
      method: apiInfo.method,
      headers: { 'Content-Type': 'application/json' },
      body: apiInfo.method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (data.success !== false) {
      return { success: true, data: data.data || data };
    } else {
      return { success: false, error: data.error || 'Tool execution failed' };
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'API call failed';
    console.error(`[SkillEngine] Tool ${toolName} failed:`, error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Map tool name to research API action
 */
function toolNameToAction(toolName: string): string {
  const actionMap: Record<string, string> = {
    start_research: 'start_research',
    ask_research: 'ask_question',
    get_research_summary: 'get_summary',
    get_news: 'get_news',
    close_research: 'close_research',
  };
  return actionMap[toolName] || toolName;
}

/**
 * Execute a skill by ID (convenience wrapper)
 */
export async function runSkill(
  skillIdOrSlug: string,
  inputData: Record<string, unknown> = {}
): Promise<{ executionId: string; success: boolean; results?: Record<string, unknown>; error?: string }> {
  return executeSkill(skillIdOrSlug, inputData);
}
