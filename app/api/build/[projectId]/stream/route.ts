import { NextRequest } from 'next/server';
import { subscribeToBuildProgress } from '@/lib/buildOrchestrator';
import type { BuildProgressEvent } from '@/types/build';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  if (!projectId) {
    return new Response('Project ID is required', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`)
      );

      // Subscribe to build progress events
      const unsubscribe = subscribeToBuildProgress(projectId, (event: BuildProgressEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );

          // Close the stream if build is complete or failed
          if (event.phase === 'complete' || event.phase === 'failed') {
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
