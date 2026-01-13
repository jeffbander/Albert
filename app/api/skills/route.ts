/**
 * Skills API Route
 * Main endpoint for listing and creating skills.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listSkills,
  createSkill,
  getSkillBySlug,
} from '@/lib/db';
import type { CreateSkillInput, SkillApiResponse, ListSkillsResponse, SkillParameter } from '@/types/skill';

/**
 * GET /api/skills - List all skills
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const skills = await listSkills(activeOnly);

    const response: SkillApiResponse<ListSkillsResponse> = {
      success: true,
      data: {
        skills,
        total: skills.length,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Skills API] Error listing skills:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list skills',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills - Create a new skill
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, triggers, steps, instructions, allowedTools } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Description is required' },
        { status: 400 }
      );
    }

    if (!triggers || !Array.isArray(triggers) || triggers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one trigger phrase is required' },
        { status: 400 }
      );
    }

    if (!steps || !Array.isArray(steps)) {
      return NextResponse.json(
        { success: false, error: 'Steps array is required' },
        { status: 400 }
      );
    }

    // Validate steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.name || !step.toolName || !step.outputKey) {
        return NextResponse.json(
          {
            success: false,
            error: `Step ${i + 1} is missing required fields (name, toolName, outputKey)`,
          },
          { status: 400 }
        );
      }
    }

    // Check for duplicate slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 64);

    const existing = await getSkillBySlug(slug);
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A skill with a similar name already exists: "${existing.name}"` },
        { status: 409 }
      );
    }

    // Create the skill
    const input: CreateSkillInput = {
      name,
      description,
      triggers,
      steps: steps.map((step: {
        name: string;
        description?: string;
        toolName: string;
        parameterMapping?: Record<string, SkillParameter>;
        outputKey: string;
        condition?: string;
        onSuccess?: string;
        onFailure?: string;
        retryCount?: number;
        extractFields?: string[];
      }) => ({
        name: step.name,
        description: step.description,
        toolName: step.toolName,
        parameterMapping: (step.parameterMapping || {}) as Record<string, SkillParameter>,
        outputKey: step.outputKey,
        condition: step.condition,
        onSuccess: step.onSuccess,
        onFailure: step.onFailure,
        retryCount: step.retryCount,
        extractFields: step.extractFields,
      })),
      instructions,
      allowedTools,
    };

    const skillId = await createSkill(input);

    console.log(`[Skills API] Created skill "${name}" with ID ${skillId}`);

    return NextResponse.json({
      success: true,
      skillId,
      stepCount: steps.length,
      message: `Created skill "${name}" with ${steps.length} steps`,
    });
  } catch (error) {
    console.error('[Skills API] Error creating skill:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create skill',
      },
      { status: 500 }
    );
  }
}
