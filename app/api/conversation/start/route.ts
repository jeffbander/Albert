import { NextRequest, NextResponse } from 'next/server';
import { createConversation, initDatabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    // Ensure database is initialized
    await initDatabase();

    // Create the conversation record
    await createConversation(conversationId);

    return NextResponse.json({ success: true, conversationId });
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      { error: 'Failed to start conversation' },
      { status: 500 }
    );
  }
}
