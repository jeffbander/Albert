import { NextResponse } from 'next/server';
import { getRecentMemories, getEchoMemories } from '@/lib/mem0';
import {
  getEchoSelfModel,
  getTimeline,
  getRecentEpisodicMemories,
  getProceduralMemories,
  getConversationCount,
  getTotalInteractionTime,
} from '@/lib/db';

// Force dynamic rendering for API routes with database access
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      userMemories,
      echoMemories,
      selfModel,
      timeline,
      episodicMemories,
      proceduralMemories,
      conversationCount,
      totalSeconds,
    ] = await Promise.all([
      getRecentMemories(50).catch(e => ({ error: e.message })),
      getEchoMemories(50).catch(e => ({ error: e.message })),
      getEchoSelfModel().catch(e => ({ error: e.message })),
      getTimeline(20).catch(e => ({ error: e.message })),
      getRecentEpisodicMemories(30).catch(e => ({ error: e.message })),
      getProceduralMemories().catch(e => ({ error: e.message })),
      getConversationCount().catch(e => ({ error: e.message })),
      getTotalInteractionTime().catch(e => ({ error: e.message })),
    ]);

    return NextResponse.json({
      mem0: {
        userMemoriesCount: Array.isArray(userMemories) ? userMemories.length : userMemories,
        userMemories: Array.isArray(userMemories) ? userMemories.slice(0, 5) : userMemories,
        echoMemoriesCount: Array.isArray(echoMemories) ? echoMemories.length : echoMemories,
        echoMemories: Array.isArray(echoMemories) ? echoMemories.slice(0, 5) : echoMemories,
      },
      database: {
        conversationCount,
        totalMinutes: typeof totalSeconds === 'number' ? Math.round(totalSeconds / 60) : totalSeconds,
        selfModel,
        timelineCount: Array.isArray(timeline) ? timeline.length : timeline,
        timeline: Array.isArray(timeline) ? timeline.slice(0, 5) : timeline,
        episodicMemoriesCount: Array.isArray(episodicMemories) ? episodicMemories.length : episodicMemories,
        episodicMemories: Array.isArray(episodicMemories) ? episodicMemories.slice(0, 5) : episodicMemories,
        proceduralMemoriesCount: Array.isArray(proceduralMemories) ? proceduralMemories.length : proceduralMemories,
      },
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
