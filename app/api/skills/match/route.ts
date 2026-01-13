/**
 * Skill Match API Route
 * Match natural language utterances to saved skills.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listSkills } from '@/lib/db';
import type { AlbertSkill, SkillMatchResult, MatchSkillsResponse, SkillApiResponse } from '@/types/skill';

/**
 * Calculate similarity between two strings
 * Uses a combination of exact matching, substring matching, and word overlap
 */
function calculateSimilarity(a: string, b: string): number {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  // Exact match
  if (normalizedA === normalizedB) return 1.0;

  // Contains match
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    const shorter = normalizedA.length < normalizedB.length ? normalizedA : normalizedB;
    const longer = normalizedA.length < normalizedB.length ? normalizedB : normalizedA;
    return 0.7 + (0.3 * shorter.length / longer.length);
  }

  // Word overlap (Jaccard similarity)
  const wordsA = new Set(normalizedA.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(normalizedB.split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  const jaccardScore = intersection.size / union.size;

  // Boost score if key words match
  const keyWords = ['research', 'recipe', 'email', 'send', 'check', 'find', 'get', 'create', 'build'];
  let keyWordBoost = 0;
  for (const keyword of keyWords) {
    if (normalizedA.includes(keyword) && normalizedB.includes(keyword)) {
      keyWordBoost += 0.1;
    }
  }

  return Math.min(1.0, jaccardScore + keyWordBoost);
}

/**
 * Match an utterance to available skills
 */
function matchSkill(
  utterance: string,
  skills: AlbertSkill[],
  threshold: number = 0.4
): SkillMatchResult[] {
  const normalizedUtterance = utterance.toLowerCase().trim();
  const matches: SkillMatchResult[] = [];

  for (const skill of skills) {
    if (!skill.isActive) continue;

    let bestScore = 0;
    let matchedTrigger: string | undefined;

    // Check triggers
    for (const trigger of skill.triggers) {
      const score = calculateSimilarity(normalizedUtterance, trigger);
      if (score > bestScore) {
        bestScore = score;
        matchedTrigger = trigger;
      }
    }

    // Check name
    const nameScore = calculateSimilarity(normalizedUtterance, skill.name);
    if (nameScore > bestScore) {
      bestScore = nameScore;
      matchedTrigger = undefined;
    }

    // Check description (with lower weight)
    const descScore = calculateSimilarity(normalizedUtterance, skill.description) * 0.7;
    if (descScore > bestScore) {
      bestScore = descScore;
      matchedTrigger = undefined;
    }

    if (bestScore >= threshold) {
      matches.push({
        skill,
        confidence: bestScore,
        matchedTrigger,
      });
    }
  }

  // Sort by confidence
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * POST /api/skills/match - Match an utterance to skills
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { utterance, threshold = 0.4 } = body;

    if (!utterance || typeof utterance !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Utterance is required' },
        { status: 400 }
      );
    }

    const skills = await listSkills(true); // Active only
    const matches = matchSkill(utterance, skills, threshold);

    const response: SkillApiResponse<MatchSkillsResponse> = {
      success: true,
      data: {
        matches,
        bestMatch: matches.length > 0 ? matches[0] : undefined,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Skills API] Error matching skill:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to match skills',
      },
      { status: 500 }
    );
  }
}
