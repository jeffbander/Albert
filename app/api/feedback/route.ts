import { NextResponse } from 'next/server';
import {
  addResponseFeedback,
  getFeedbackStats,
  getFeedbackPatterns,
  initDatabase,
} from '@/lib/db';

// POST /api/feedback - Add feedback for a response
export async function POST(request: Request) {
  try {
    await initDatabase();

    const body = await request.json();
    const {
      conversationId,
      messageId,
      rating,
      feedbackType,
      memoriesUsed,
    } = body;

    // Validate required fields
    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      );
    }

    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json(
        { error: 'messageId is required' },
        { status: 400 }
      );
    }

    if (!rating || (rating !== 'up' && rating !== 'down')) {
      return NextResponse.json(
        { error: 'rating must be "up" or "down"' },
        { status: 400 }
      );
    }

    // Add feedback to database
    const feedbackId = await addResponseFeedback(
      conversationId,
      messageId,
      rating,
      {
        feedbackType: feedbackType || undefined,
        memoriesUsed: memoriesUsed || undefined,
      }
    );

    console.log(`[Feedback] ${rating === 'up' ? '👍' : '👎'} Received for message ${messageId}`);

    return NextResponse.json({
      success: true,
      feedbackId,
      message: `Feedback recorded: ${rating}`,
    });
  } catch (error) {
    console.error('Error adding feedback:', error);
    return NextResponse.json(
      { error: 'Failed to add feedback' },
      { status: 500 }
    );
  }
}

// GET /api/feedback - Get feedback statistics
export async function GET(request: Request) {
  try {
    await initDatabase();

    const { searchParams } = new URL(request.url);
    const includePatterns = searchParams.get('patterns') === 'true';

    const stats = await getFeedbackStats();

    let response: {
      totalUp: number;
      totalDown: number;
      positiveRatio: number;
      recentFeedback: unknown[];
      patterns?: unknown;
    } = {
      totalUp: stats.totalUp,
      totalDown: stats.totalDown,
      positiveRatio: stats.totalUp + stats.totalDown > 0
        ? stats.totalUp / (stats.totalUp + stats.totalDown)
        : 0,
      recentFeedback: stats.recentFeedback,
    };

    if (includePatterns) {
      const patterns = await getFeedbackPatterns();
      response = {
        ...response,
        patterns,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting feedback stats:', error);
    return NextResponse.json(
      { error: 'Failed to get feedback stats' },
      { status: 500 }
    );
  }
}
