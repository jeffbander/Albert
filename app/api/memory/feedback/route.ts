import { NextRequest, NextResponse } from 'next/server';
import {
  recordMemoryUsage,
  recordMemoryFeedback,
  getMemoryEffectiveness,
  getMostEffectiveMemoryIds,
  getLeastEffectiveMemoryIds,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'effective'; // 'effective', 'ineffective', 'single'
  const memoryId = searchParams.get('memoryId');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    if (type === 'single' && memoryId) {
      const effectiveness = await getMemoryEffectiveness(memoryId);
      return NextResponse.json({ effectiveness });
    }

    if (type === 'ineffective') {
      const ids = await getLeastEffectiveMemoryIds(limit);
      return NextResponse.json({ memoryIds: ids });
    }

    // Default: most effective
    const ids = await getMostEffectiveMemoryIds(limit);
    return NextResponse.json({ memoryIds: ids });
  } catch (error) {
    console.error('Error fetching memory effectiveness:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, memoryIds, feedbackId, rating, taskCompleted, feedbackText, conversationId } = body;

    if (action === 'record_usage') {
      if (!memoryIds || !Array.isArray(memoryIds)) {
        return NextResponse.json({ error: 'memoryIds array required' }, { status: 400 });
      }
      const id = await recordMemoryUsage(memoryIds, conversationId);
      return NextResponse.json({ feedbackId: id });
    }

    if (action === 'record_feedback') {
      if (!feedbackId || !rating) {
        return NextResponse.json({ error: 'feedbackId and rating required' }, { status: 400 });
      }
      if (!['positive', 'negative', 'neutral'].includes(rating)) {
        return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
      }
      await recordMemoryFeedback(feedbackId, rating, taskCompleted || false, feedbackText);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action. Use record_usage or record_feedback' }, { status: 400 });
  } catch (error) {
    console.error('Error recording feedback:', error);
    return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
  }
}
