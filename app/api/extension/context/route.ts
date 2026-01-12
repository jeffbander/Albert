import { NextRequest, NextResponse } from 'next/server';

/**
 * Extension Context API
 *
 * Receives page context from the Chrome extension and returns
 * analysis or stores it for conversation context.
 *
 * Used by the Albert browser extension to send current page
 * information to the AI assistant.
 */

interface PageContext {
  url: string;
  title: string;
  selectedText?: string;
  pageText?: string;
  timestamp?: number;
}

export async function POST(request: NextRequest) {
  try {
    const context: PageContext = await request.json();

    // Validate required fields
    if (!context.url || !context.title) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: url and title',
      }, { status: 400 });
    }

    // Add timestamp if not provided
    const enrichedContext = {
      ...context,
      timestamp: context.timestamp || Date.now(),
    };

    // Truncate page text if too long
    if (enrichedContext.pageText && enrichedContext.pageText.length > 10000) {
      enrichedContext.pageText = enrichedContext.pageText.slice(0, 10000) + '...';
    }

    // Here you could:
    // 1. Store in database for conversation context
    // 2. Send to memory system (Mem0)
    // 3. Process with AI for summarization
    // For now, we just acknowledge receipt

    console.log('[Extension Context] Received context from:', context.url);

    return NextResponse.json({
      success: true,
      message: 'Context received',
      context: {
        url: enrichedContext.url,
        title: enrichedContext.title,
        hasSelectedText: !!enrichedContext.selectedText,
        pageTextLength: enrichedContext.pageText?.length || 0,
        timestamp: enrichedContext.timestamp,
      },
    });
  } catch (error) {
    console.error('[Extension Context] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process context',
    }, { status: 500 });
  }
}

// GET endpoint to check extension connectivity
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Extension context API is ready',
    version: '1.0.0',
    endpoints: {
      post: 'Send page context with { url, title, selectedText?, pageText? }',
    },
  });
}
