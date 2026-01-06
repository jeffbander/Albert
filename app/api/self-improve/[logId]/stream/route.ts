import { NextRequest } from 'next/server';
import { getActiveImprovementAsync } from '@/lib/selfImprovementStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Maximum stream lifetime (30 minutes)
const MAX_STREAM_LIFETIME_MS = 30 * 60 * 1000;

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// Poll interval (500ms)
const POLL_INTERVAL_MS = 500;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  const { logId } = await params;
  const startTime = Date.now();

  const encoder = new TextEncoder();
  let lastActivityCount = 0;
  let lastMessageCount = 0;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to safely enqueue data
      const safeEnqueue = (data: string) => {
        if (isClosed) return false;
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          isClosed = true;
          return false;
        }
      };

      // Helper to safely close stream
      const safeClose = () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // Send initial connection message
      safeEnqueue(`data: ${JSON.stringify({ type: 'connected', logId })}\n\n`);

      // Set up poll interval
      const pollInterval = setInterval(async () => {
        if (isClosed) {
          clearInterval(pollInterval);
          return;
        }

        // Check max lifetime
        if (Date.now() - startTime > MAX_STREAM_LIFETIME_MS) {
          safeEnqueue(`data: ${JSON.stringify({
            type: 'timeout',
            message: 'Stream exceeded maximum lifetime',
          })}\n\n`);
          clearInterval(pollInterval);
          safeClose();
          return;
        }

        try {
          const improvement = await getActiveImprovementAsync(logId);

          if (!improvement) {
            // Improvement not found or completed
            safeEnqueue(`data: ${JSON.stringify({ type: 'not_found', logId })}\n\n`);
            clearInterval(pollInterval);
            safeClose();
            return;
          }

          // Send new activities
          if (improvement.activities.length > lastActivityCount) {
            const newActivities = improvement.activities.slice(lastActivityCount);
            for (const activity of newActivities) {
              if (!safeEnqueue(`data: ${JSON.stringify({ type: 'activity', activity })}\n\n`)) {
                clearInterval(pollInterval);
                return;
              }
            }
            lastActivityCount = improvement.activities.length;
          }

          // Send new messages
          if (improvement.messages.length > lastMessageCount) {
            const newMessages = improvement.messages.slice(lastMessageCount);
            for (const message of newMessages) {
              if (!safeEnqueue(`data: ${JSON.stringify({ type: 'message', message })}\n\n`)) {
                clearInterval(pollInterval);
                return;
              }
            }
            lastMessageCount = improvement.messages.length;
          }

          // Check if improvement is complete
          if (improvement.status === 'completed' || improvement.status === 'failed') {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'complete',
              status: improvement.status,
              activityCount: improvement.activities.length,
              messageCount: improvement.messages.length,
            })}\n\n`);
            clearInterval(pollInterval);
            safeClose();
          }
        } catch (error) {
          console.error('[Self-Improve Stream] Error:', error);
          safeEnqueue(`data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`);
          clearInterval(pollInterval);
          safeClose();
        }
      }, POLL_INTERVAL_MS);

      // Set up heartbeat to detect dead connections
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval);
          return;
        }

        // Check max lifetime
        if (Date.now() - startTime > MAX_STREAM_LIFETIME_MS) {
          clearInterval(heartbeatInterval);
          return;
        }

        // Send heartbeat
        if (!safeEnqueue(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)) {
          clearInterval(heartbeatInterval);
          clearInterval(pollInterval);
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Clean up on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        safeClose();
      });

      // Safety timeout to ensure cleanup
      setTimeout(() => {
        if (!isClosed) {
          console.warn(`[Self-Improve Stream] Force closing stream ${logId} after max lifetime`);
          clearInterval(pollInterval);
          clearInterval(heartbeatInterval);
          safeClose();
        }
      }, MAX_STREAM_LIFETIME_MS + 1000);
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
