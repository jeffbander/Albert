/**
 * Skill Execution SSE Stream
 * Provides real-time progress updates for skill executions via Server-Sent Events.
 */

export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { subscribeToSkillProgress, getExecutionById } from '@/lib/skills';
import type { SkillProgressEvent } from '@/types/skill';

interface RouteContext {
  params: Promise<{ executionId: string }>;
}

/**
 * GET /api/skills/executions/[executionId]/stream - SSE progress stream
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { executionId } = await context.params;

  // Verify execution exists
  const execution = await getExecutionById(executionId);
  if (!execution) {
    return new Response(JSON.stringify({ error: 'Execution not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create the SSE stream
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const initMessage = `data: ${JSON.stringify({
        type: 'connected',
        executionId,
        status: execution.status,
        timestamp: new Date().toISOString(),
      })}\n\n`;
      controller.enqueue(encoder.encode(initMessage));

      // If already completed/failed, send final status and close
      if (execution.status === 'completed' || execution.status === 'failed') {
        const finalMessage = `data: ${JSON.stringify({
          type: 'complete',
          executionId,
          status: execution.status,
          results: execution.stepResults,
          error: execution.error,
          timestamp: new Date().toISOString(),
        })}\n\n`;
        controller.enqueue(encoder.encode(finalMessage));
        controller.close();
        return;
      }

      // Subscribe to progress events
      unsubscribe = subscribeToSkillProgress(executionId, (event: SkillProgressEvent) => {
        if (isClosed) return;

        try {
          const message = `data: ${JSON.stringify({
            type: 'progress',
            ...event,
          })}\n\n`;
          controller.enqueue(encoder.encode(message));

          // Close stream on completion or failure
          if (event.status === 'completed' || event.status === 'failed') {
            isClosed = true;
            if (unsubscribe) {
              unsubscribe();
              unsubscribe = null;
            }
            controller.close();
          }
        } catch (error) {
          console.error('[Skills Stream] Error sending event:', error);
        }
      });

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(heartbeat);
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      });
    },

    cancel() {
      isClosed = true;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
