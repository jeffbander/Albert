import { NextRequest, NextResponse } from 'next/server';
import { addMemory, addEchoMemory } from '@/lib/mem0';

export async function POST(request: NextRequest) {
  try {
    const { content, metadata, isEchoMemory = false } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    let result;
    if (isEchoMemory) {
      result = await addEchoMemory(content, metadata);
    } else {
      result = await addMemory(content, metadata);
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error adding memory:', error);
    return NextResponse.json(
      { error: 'Failed to add memory' },
      { status: 500 }
    );
  }
}
