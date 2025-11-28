import { NextRequest, NextResponse } from 'next/server';
import {
  getTimeline,
  getTimelineByType,
  getRecentEpisodicMemories,
  getSignificantEpisodicMemories,
  type TimelineMilestone,
} from '@/lib/db';
import { getTimelineNarrative } from '@/lib/metacognition';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as TimelineMilestone['milestone_type'] | null;
    const format = searchParams.get('format') || 'json'; // 'json' or 'narrative'
    const includeEpisodic = searchParams.get('episodic') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (format === 'narrative') {
      const narrative = await getTimelineNarrative();
      return NextResponse.json({ narrative });
    }

    // Get milestones
    const milestones = type
      ? await getTimelineByType(type)
      : await getTimeline(limit);

    // Optionally include episodic memories
    let episodicMemories = null;
    if (includeEpisodic) {
      const significant = await getSignificantEpisodicMemories(0.6);
      const recent = await getRecentEpisodicMemories(10);

      // Merge and deduplicate
      const seen = new Set<string>();
      episodicMemories = [...significant, ...recent].filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    }

    // Build a chronological timeline
    const timeline = milestones.map(m => ({
      id: m.id,
      type: 'milestone',
      milestoneType: m.milestone_type,
      title: m.title,
      description: m.description,
      significance: m.significance,
      date: m.occurred_at.toISOString(),
    }));

    return NextResponse.json({
      timeline,
      episodicMemories: episodicMemories?.map(e => ({
        id: e.id,
        type: 'episode',
        eventType: e.event_type,
        summary: e.summary,
        emotionalValence: e.emotional_valence,
        significance: e.significance,
        entities: e.entities,
        date: e.occurred_at.toISOString(),
      })),
      stats: {
        totalMilestones: milestones.length,
        milestoneTypes: Array.from(new Set(milestones.map(m => m.milestone_type))),
      },
    });
  } catch (error) {
    console.error('Error getting timeline:', error);
    return NextResponse.json(
      { error: 'Failed to get timeline' },
      { status: 500 }
    );
  }
}
