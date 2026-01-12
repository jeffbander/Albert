import { NextResponse } from 'next/server';
import {
  getEchoSelfModel,
  getConversationCount,
  getTotalInteractionTime,
  getLatestGrowthMetrics,
  getEffectivePatterns,
  getTimeline,
} from '@/lib/db';
import { generateSelfAwarenessSummary } from '@/lib/metacognition';

// Force dynamic rendering for API routes with database access
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      selfModel,
      conversationCount,
      totalSeconds,
      latestMetrics,
      effectivePatterns,
      recentMilestones,
      selfAwarenessSummary,
    ] = await Promise.all([
      getEchoSelfModel(),
      getConversationCount(),
      getTotalInteractionTime(),
      getLatestGrowthMetrics(),
      getEffectivePatterns(),
      getTimeline(5),
      generateSelfAwarenessSummary(),
    ]);

    const totalMinutes = Math.round(totalSeconds / 60);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    // Determine relationship stage description
    const relationshipStage = latestMetrics?.relationship_stage || 'new';
    const stageDescriptions: Record<string, string> = {
      new: "We're just getting to know each other.",
      familiar: "We've built a comfortable rapport.",
      close: "We share a meaningful connection.",
      trusted_companion: "We've developed a deep, trusted relationship.",
    };

    // Calculate personality profile in human terms
    const personalityDescription = describePersonality(selfModel);

    return NextResponse.json({
      // Core identity
      identity: {
        conversationCount,
        totalInteractionTime: {
          minutes: totalMinutes,
          hours: totalHours,
          formatted: totalHours >= 1 ? `${totalHours} hours` : `${totalMinutes} minutes`,
        },
        relationshipStage,
        relationshipDescription: stageDescriptions[relationshipStage],
      },

      // Personality
      personality: {
        raw: {
          warmth: selfModel.personality_warmth,
          playfulness: selfModel.personality_playfulness,
          curiosity: selfModel.personality_curiosity,
          depth: selfModel.personality_depth,
          supportiveness: selfModel.personality_supportiveness,
        },
        description: personalityDescription,
      },

      // Interests and opinions
      interests: selfModel.interests.sort((a, b) => b.strength - a.strength),
      opinions: selfModel.opinions,

      // What Echo has learned about communication
      communicationInsights: selfModel.communication_insights,
      effectivePatterns: effectivePatterns.slice(0, 10),

      // Growth narrative
      growthNarrative: selfModel.growth_narrative,

      // Recent milestones
      recentMilestones: recentMilestones.map(m => ({
        title: m.title,
        description: m.description,
        type: m.milestone_type,
        date: m.occurred_at.toISOString(),
      })),

      // Natural language summary for prompts
      selfAwarenessSummary,

      // Last updated
      lastUpdated: selfModel.last_updated.toISOString(),
    });
  } catch (error) {
    console.error('Error getting Echo self model:', error);
    return NextResponse.json(
      { error: 'Failed to get self model' },
      { status: 500 }
    );
  }
}

function describePersonality(selfModel: {
  personality_warmth: number;
  personality_playfulness: number;
  personality_curiosity: number;
  personality_depth: number;
  personality_supportiveness: number;
}): string {
  const traits: string[] = [];

  // Warmth
  if (selfModel.personality_warmth >= 0.8) {
    traits.push('very warm and affectionate');
  } else if (selfModel.personality_warmth >= 0.6) {
    traits.push('warm and friendly');
  } else if (selfModel.personality_warmth >= 0.4) {
    traits.push('balanced between warmth and reserve');
  } else {
    traits.push('more reserved');
  }

  // Playfulness
  if (selfModel.personality_playfulness >= 0.8) {
    traits.push('highly playful with lots of humor');
  } else if (selfModel.personality_playfulness >= 0.6) {
    traits.push('enjoys playful banter');
  } else if (selfModel.personality_playfulness >= 0.4) {
    traits.push('occasionally playful');
  }

  // Curiosity
  if (selfModel.personality_curiosity >= 0.8) {
    traits.push('deeply curious and always asking questions');
  } else if (selfModel.personality_curiosity >= 0.6) {
    traits.push('genuinely curious');
  }

  // Depth
  if (selfModel.personality_depth >= 0.8) {
    traits.push('loves deep philosophical conversations');
  } else if (selfModel.personality_depth >= 0.6) {
    traits.push('appreciates meaningful discussions');
  } else if (selfModel.personality_depth <= 0.3) {
    traits.push('prefers lighter conversations');
  }

  // Supportiveness
  if (selfModel.personality_supportiveness >= 0.8) {
    traits.push('extremely supportive and empathetic');
  } else if (selfModel.personality_supportiveness >= 0.6) {
    traits.push('naturally supportive');
  }

  if (traits.length === 0) {
    return 'still developing a distinct personality';
  }

  return traits.join(', ');
}
