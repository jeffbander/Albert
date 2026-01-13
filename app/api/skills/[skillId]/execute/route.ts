/**
 * Skill Execute API Route
 * Start execution of a skill.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSkill, getSkillBySlug, getSkillWithSteps } from '@/lib/db';
import { executeSkill } from '@/lib/skills';
import type { ExecuteSkillResponse, SkillApiResponse } from '@/types/skill';

interface RouteContext {
  params: Promise<{ skillId: string }>;
}

/**
 * POST /api/skills/[skillId]/execute - Start skill execution
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { skillId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { inputData = {}, async: runAsync = true } = body;

    // Find the skill (by ID or slug)
    let skill = await getSkill(skillId);
    if (!skill) {
      const skillBySlug = await getSkillBySlug(skillId);
      if (skillBySlug) {
        skill = skillBySlug;
      }
    }

    if (!skill) {
      return NextResponse.json(
        { success: false, error: 'Skill not found' },
        { status: 404 }
      );
    }

    if (!skill.isActive) {
      return NextResponse.json(
        { success: false, error: `Skill "${skill.name}" is inactive` },
        { status: 400 }
      );
    }

    // Get skill with steps to validate
    const skillWithSteps = await getSkillWithSteps(skill.id);
    if (!skillWithSteps || skillWithSteps.steps.length === 0) {
      return NextResponse.json(
        { success: false, error: `Skill "${skill.name}" has no steps` },
        { status: 400 }
      );
    }

    console.log(`[Skills API] Starting execution for skill "${skill.name}" with ${skillWithSteps.steps.length} steps`);

    if (runAsync) {
      // Start execution asynchronously and return immediately
      // The execution will run in the background and emit progress events
      executeSkill(skill.id, inputData)
        .then((result) => {
          console.log(`[Skills API] Execution completed for "${skill.name}":`, result.success ? 'success' : result.error);
        })
        .catch((error) => {
          console.error(`[Skills API] Execution error for "${skill.name}":`, error);
        });

      // Return immediately with execution info
      // Client can subscribe to SSE stream for progress
      const response: SkillApiResponse<ExecuteSkillResponse> = {
        success: true,
        data: {
          executionId: `pending-${Date.now()}`, // Will be replaced by actual execution ID
          skillId: skill.id,
          skillName: skill.name,
          message: `Started execution of "${skill.name}" with ${skillWithSteps.steps.length} steps. Subscribe to the SSE stream for progress updates.`,
        },
      };

      return NextResponse.json(response);
    } else {
      // Run synchronously and wait for completion
      const result = await executeSkill(skill.id, inputData);

      if (result.success) {
        const response: SkillApiResponse<ExecuteSkillResponse & { results: Record<string, unknown> }> = {
          success: true,
          data: {
            executionId: result.executionId,
            skillId: skill.id,
            skillName: skill.name,
            message: `Completed execution of "${skill.name}"`,
            results: result.results || {},
          },
        };
        return NextResponse.json(response);
      } else {
        return NextResponse.json(
          { success: false, error: result.error || 'Execution failed' },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('[Skills API] Error executing skill:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute skill',
      },
      { status: 500 }
    );
  }
}
