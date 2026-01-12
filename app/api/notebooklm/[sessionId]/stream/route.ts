/**
 * NotebookLM Research Progress Stream
 * Server-Sent Events endpoint for real-time research progress updates.
 * Pattern follows build/[projectId]/stream/route.ts
 */

// Force dynamic rendering to prevent build-time database connection
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { subscribeToResearchProgress, getResearchSession } from '@/lib/researchSessionStore';
import type { ResearchProgressEvent } from '@/types/research';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  if (!sessionId) {
    return new Response('Session ID is required', { status: 400 });
  }

  // Check if session exists
  const session = await getResearchSession(sessionId);
  if (!session) {
    return new Response('Session not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          sessionId,
          topic: session.topic,
          phase: session.phase,
        })}\n\n`)
      );

      // Subscribe to research progress events
      const unsubscribe = subscribeToResearchProgress(sessionId, (event: ResearchProgressEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );

          // Close the stream if research is complete or failed
          if (event.phase === 'complete' || event.phase === 'error') {
            setTimeout(() => {
              try {
                controller.close();
              } catch {
                // Already closed
              }
            }, 1000);
          }
        } catch {
          // Stream might be closed
        }
      });

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          clearInterval(keepAlive);
          unsubscribe();
        }
      }, 30000);

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
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
