import { NextRequest } from 'next/server';
import { getActiveImprovement } from '@/lib/selfImprovementStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  const { logId } = await params;

  const encoder = new TextEncoder();
  let lastActivityCount = 0;
  let lastMessageCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', logId })}\n\n`)
      );

      // Poll for updates
      const interval = setInterval(() => {
        try {
          const improvement = getActiveImprovement(logId);

          if (!improvement) {
            // Improvement not found or completed
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'not_found', logId })}\n\n`)
            );
            clearInterval(interval);
            controller.close();
            return;
          }

          // Send new activities
          if (improvement.activities.length > lastActivityCount) {
            const newActivities = improvement.activities.slice(lastActivityCount);
            for (const activity of newActivities) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'activity', activity })}\n\n`)
              );
            }
            lastActivityCount = improvement.activities.length;
          }

          // Send new messages
          if (improvement.messages.length > lastMessageCount) {
            const newMessages = improvement.messages.slice(lastMessageCount);
            for (const message of newMessages) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'message', message })}\n\n`)
              );
            }
            lastMessageCount = improvement.messages.length;
          }

          // Check if improvement is complete
          if (improvement.status === 'completed' || improvement.status === 'failed') {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'complete',
                status: improvement.status,
                activityCount: improvement.activities.length,
                messageCount: improvement.messages.length,
              })}\n\n`)
            );
            clearInterval(interval);
            controller.close();
          }
        } catch (error) {
          console.error('[Self-Improve Stream] Error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`)
          );
          clearInterval(interval);
          controller.close();
        }
      }, 500); // Poll every 500ms

      // Clean up on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
