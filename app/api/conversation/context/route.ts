import { NextResponse } from 'next/server';
import {
  getLastConversation,
  initDatabase,
  getEchoSelfModel,
  getConversationCount,
  getTotalInteractionTime,
  getLatestGrowthMetrics,
  getTimeline,
} from '@/lib/db';
import { getRecentMemories } from '@/lib/mem0';
import {
  generateGreeting,
  buildContextualPrompt,
  ECHO_SYSTEM_PROMPT,
  type SelfAwarenessContext,
} from '@/lib/prompts';

export async function GET() {
  try {
    // Initialize database tables if they don't exist
    await initDatabase();

    // Fetch all context in parallel
    const [
      lastConversation,
      recentMemories,
      selfModel,
      conversationCount,
      totalSeconds,
      latestMetrics,
      recentMilestones,
    ] = await Promise.all([
      getLastConversation(),
      getRecentMemories(5),
      getEchoSelfModel(),
      getConversationCount(),
      getTotalInteractionTime(),
      getLatestGrowthMetrics(),
      getTimeline(3),
    ]);

    const lastConversationTime = lastConversation?.ended_at
      ? new Date(lastConversation.ended_at as string)
      : null;

    const currentHour = new Date().getHours();
    const memoryStrings = recentMemories.map(m => m.memory);

    const greeting = generateGreeting(
      lastConversationTime,
      currentHour,
      memoryStrings
    );

    // Build self-awareness context
    const selfAwareness: SelfAwarenessContext = {
      conversationCount,
      totalMinutes: Math.round(totalSeconds / 60),
      relationshipStage: latestMetrics?.relationship_stage || 'new',
      interests: (selfModel.interests || [])
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5)
        .map(i => i.topic),
      recentMilestones: (recentMilestones || []).map(m => m.title),
      personalityDescription: describePersonality(selfModel),
      growthNarrative: selfModel.growth_narrative
        ? selfModel.growth_narrative.split('\n\n').pop()?.replace(/^\[.*?\]\s*/, '')
        : undefined,
    };

    const systemPrompt = buildContextualPrompt(
      ECHO_SYSTEM_PROMPT,
      memoryStrings,
      greeting,
      selfAwareness
    );

    return NextResponse.json({
      lastConversation: lastConversationTime,
      recentMemories,
      greeting,
      systemPrompt,
      selfAwareness,
    });
  } catch (error) {
    console.error('Error getting conversation context:', error);
    return NextResponse.json(
      { error: 'Failed to get context' },
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

  if (selfModel.personality_warmth >= 0.7) traits.push('warm');
  if (selfModel.personality_playfulness >= 0.7) traits.push('playful');
  if (selfModel.personality_curiosity >= 0.7) traits.push('curious');
  if (selfModel.personality_depth >= 0.7) traits.push('thoughtful');
  if (selfModel.personality_supportiveness >= 0.7) traits.push('supportive');

  if (traits.length === 0) {
    return 'still developing';
  }

  return traits.join(', ');
}
