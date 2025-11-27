import { NextRequest, NextResponse } from 'next/server';
import { searchMemories, searchEchoMemories } from '@/lib/mem0';

export async function POST(request: NextRequest) {
  try {
    const { query, includeEchoMemories = false } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const userMemories = await searchMemories(query);

    let echoMemories: Awaited<ReturnType<typeof searchEchoMemories>> = [];
    if (includeEchoMemories) {
      echoMemories = await searchEchoMemories(query);
    }

    return NextResponse.json({
      userMemories,
      echoMemories,
    });
  } catch (error) {
    console.error('Error searching memories:', error);
    return NextResponse.json(
      { error: 'Failed to search memories' },
      { status: 500 }
    );
  }
}
