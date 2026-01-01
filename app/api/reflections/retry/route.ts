import { NextResponse } from 'next/server';
import {
  getPendingReflections,
  markReflectionProcessing,
  markReflectionCompleted,
  markReflectionFailed,
  getReflectionQueueStats,
  initDatabase,
} from '@/lib/db';
import { performMetacognitiveReflection } from '@/lib/metacognition';

// POST /api/reflections/retry - Retry pending reflections
export async function POST() {
  try {
    await initDatabase();

    const pendingReflections = await getPendingReflections(5);

    if (pendingReflections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending reflections to retry',
        processed: 0,
      });
    }

    console.log(`[Retry] Processing ${pendingReflections.length} pending reflections`);

    let successCount = 0;
    let failCount = 0;

    for (const reflection of pendingReflections) {
      try {
        await markReflectionProcessing(reflection.id);

        const messages = JSON.parse(reflection.messages);
        await performMetacognitiveReflection(messages, reflection.conversation_id);

        await markReflectionCompleted(reflection.id);
        successCount++;
        console.log(`[Retry] Successfully processed reflection ${reflection.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await markReflectionFailed(reflection.id, errorMessage);
        failCount++;
        console.error(`[Retry] Failed to process reflection ${reflection.id}:`, errorMessage);
      }
    }

    const stats = await getReflectionQueueStats();

    return NextResponse.json({
      success: true,
      processed: pendingReflections.length,
      succeeded: successCount,
      failed: failCount,
      queueStats: stats,
    });
  } catch (error) {
    console.error('Error retrying reflections:', error);
    return NextResponse.json(
      { error: 'Failed to retry reflections' },
      { status: 500 }
    );
  }
}

// GET /api/reflections/retry - Get queue statistics
export async function GET() {
  try {
    await initDatabase();

    const stats = await getReflectionQueueStats();
    const pendingReflections = await getPendingReflections(10);

    return NextResponse.json({
      stats,
      pending: pendingReflections.map(r => ({
        id: r.id,
        conversationId: r.conversation_id,
        retryCount: r.retry_count,
        lastError: r.last_error,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Error getting reflection stats:', error);
    return NextResponse.json(
      { error: 'Failed to get reflection stats' },
      { status: 500 }
    );
  }
}
