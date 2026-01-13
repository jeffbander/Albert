/**
 * Skill Detail API Route
 * Get, update, or delete a specific skill.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSkill,
  getSkillBySlug,
  getSkillWithSteps,
  updateSkill,
  deleteSkill,
} from '@/lib/db';

interface RouteContext {
  params: Promise<{ skillId: string }>;
}

/**
 * GET /api/skills/[skillId] - Get skill details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { skillId } = await context.params;
    const { searchParams } = new URL(request.url);
    const includeSteps = searchParams.get('includeSteps') === 'true';

    // Try to find by ID first, then by slug
    let skill = includeSteps
      ? await getSkillWithSteps(skillId)
      : await getSkill(skillId);

    if (!skill) {
      // Try by slug
      const skillBySlug = await getSkillBySlug(skillId);
      if (skillBySlug) {
        skill = includeSteps
          ? await getSkillWithSteps(skillBySlug.id)
          : skillBySlug;
      }
    }

    if (!skill) {
      return NextResponse.json(
        { success: false, error: 'Skill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      skill,
    });
  } catch (error) {
    console.error('[Skills API] Error getting skill:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get skill',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/skills/[skillId] - Update a skill
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { skillId } = await context.params;
    const body = await request.json();

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

    // Update allowed fields
    const updates: {
      name?: string;
      description?: string;
      triggers?: string[];
      instructions?: string;
      isActive?: boolean;
      allowedTools?: string[];
    } = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.triggers !== undefined) updates.triggers = body.triggers;
    if (body.instructions !== undefined) updates.instructions = body.instructions;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.allowedTools !== undefined) updates.allowedTools = body.allowedTools;

    await updateSkill(skill.id, updates);

    console.log(`[Skills API] Updated skill ${skill.id}`);

    return NextResponse.json({
      success: true,
      message: `Updated skill "${skill.name}"`,
    });
  } catch (error) {
    console.error('[Skills API] Error updating skill:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update skill',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/skills/[skillId] - Delete a skill
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { skillId } = await context.params;

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

    const skillName = skill.name;
    await deleteSkill(skill.id);

    console.log(`[Skills API] Deleted skill ${skill.id}`);

    return NextResponse.json({
      success: true,
      message: `Deleted skill "${skillName}"`,
    });
  } catch (error) {
    console.error('[Skills API] Error deleting skill:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete skill',
      },
      { status: 500 }
    );
  }
}
