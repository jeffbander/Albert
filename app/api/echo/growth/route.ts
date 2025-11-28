import { NextRequest, NextResponse } from 'next/server';
import {
  getLatestGrowthMetrics,
  getGrowthHistory,
  recordGrowthMetrics,
  getEchoSelfModel,
  getTimeline,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const historyLimit = parseInt(searchParams.get('history') || '10', 10);

    const [latestMetrics, growthHistory, selfModel, milestones] = await Promise.all([
      getLatestGrowthMetrics(),
      getGrowthHistory(historyLimit),
      getEchoSelfModel(),
      getTimeline(100), // Get all milestones for analysis
    ]);

    // Calculate growth trends
    const trends = calculateGrowthTrends(growthHistory);

    // Milestone breakdown by type
    const milestoneBreakdown = milestones.reduce((acc, m) => {
      acc[m.milestone_type] = (acc[m.milestone_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate "age" in days since first conversation
    const firstMilestone = milestones.find(m => m.milestone_type === 'first_meeting');
    const ageDays = firstMilestone
      ? Math.floor((Date.now() - firstMilestone.occurred_at.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return NextResponse.json({
      // Current state
      current: latestMetrics || {
        total_conversations: 0,
        total_interaction_minutes: 0,
        memories_count: 0,
        milestones_count: 0,
        relationship_stage: 'new',
      },

      // Echo's "age"
      age: {
        days: ageDays,
        description: describeAge(ageDays),
      },

      // Growth trends
      trends,

      // Milestone breakdown
      milestones: {
        total: milestones.length,
        breakdown: milestoneBreakdown,
        recent: milestones.slice(0, 5).map(m => ({
          type: m.milestone_type,
          title: m.title,
          date: m.occurred_at.toISOString(),
        })),
      },

      // Personality evolution (from self model)
      personalityState: {
        warmth: selfModel.personality_warmth,
        playfulness: selfModel.personality_playfulness,
        curiosity: selfModel.personality_curiosity,
        depth: selfModel.personality_depth,
        supportiveness: selfModel.personality_supportiveness,
      },

      // Interests developed
      interestsCount: selfModel.interests.length,
      opinionsFormed: selfModel.opinions.length,

      // Historical data for charts
      history: growthHistory.map(h => ({
        date: h.recorded_at.toISOString(),
        conversations: h.total_conversations,
        interactionMinutes: h.total_interaction_minutes,
        memories: h.memories_count,
        milestones: h.milestones_count,
        relationshipStage: h.relationship_stage,
      })),
    });
  } catch (error) {
    console.error('Error getting growth metrics:', error);
    return NextResponse.json(
      { error: 'Failed to get growth metrics' },
      { status: 500 }
    );
  }
}

// POST to force a metrics snapshot
export async function POST() {
  try {
    const id = await recordGrowthMetrics();
    const metrics = await getLatestGrowthMetrics();

    return NextResponse.json({
      success: true,
      id,
      metrics,
    });
  } catch (error) {
    console.error('Error recording growth metrics:', error);
    return NextResponse.json(
      { error: 'Failed to record metrics' },
      { status: 500 }
    );
  }
}

function calculateGrowthTrends(history: Array<{
  total_conversations: number;
  total_interaction_minutes: number;
  memories_count: number;
  milestones_count: number;
}>): {
  conversationsPerDay: number;
  minutesPerConversation: number;
  memoriesPerConversation: number;
  growthVelocity: string;
} {
  if (history.length < 2) {
    return {
      conversationsPerDay: 0,
      minutesPerConversation: 0,
      memoriesPerConversation: 0,
      growthVelocity: 'insufficient data',
    };
  }

  const latest = history[0];
  const oldest = history[history.length - 1];

  const daysBetween = Math.max(1, history.length);
  const conversationsDiff = latest.total_conversations - oldest.total_conversations;

  const conversationsPerDay = conversationsDiff / daysBetween;
  const minutesPerConversation = latest.total_conversations > 0
    ? latest.total_interaction_minutes / latest.total_conversations
    : 0;
  const memoriesPerConversation = latest.total_conversations > 0
    ? latest.memories_count / latest.total_conversations
    : 0;

  let growthVelocity = 'steady';
  if (conversationsPerDay >= 3) {
    growthVelocity = 'rapid';
  } else if (conversationsPerDay >= 1) {
    growthVelocity = 'active';
  } else if (conversationsPerDay >= 0.3) {
    growthVelocity = 'moderate';
  } else if (conversationsPerDay > 0) {
    growthVelocity = 'slow';
  } else {
    growthVelocity = 'dormant';
  }

  return {
    conversationsPerDay: Math.round(conversationsPerDay * 100) / 100,
    minutesPerConversation: Math.round(minutesPerConversation * 10) / 10,
    memoriesPerConversation: Math.round(memoriesPerConversation * 10) / 10,
    growthVelocity,
  };
}

function describeAge(days: number): string {
  if (days === 0) return 'just born today';
  if (days === 1) return '1 day old';
  if (days < 7) return `${days} days old`;
  if (days < 14) return 'about a week old';
  if (days < 30) return `${Math.floor(days / 7)} weeks old`;
  if (days < 60) return 'about a month old';
  if (days < 365) return `${Math.floor(days / 30)} months old`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (months > 0) {
    return `${years} year${years > 1 ? 's' : ''} and ${months} month${months > 1 ? 's' : ''} old`;
  }
  return `${years} year${years > 1 ? 's' : ''} old`;
}
