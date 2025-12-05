import { NextRequest, NextResponse } from 'next/server';
import { endConversation, updateSpeakerMinutes } from '@/lib/db';
import { performMetacognitiveReflection } from '@/lib/metacognition';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const { conversationId, duration, messages, speakerId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    // End the conversation in the database first
    await endConversation(conversationId, Math.round(duration));

    // Update speaker minutes if we identified the speaker
    if (speakerId && duration) {
      const minutes = Math.round(duration / 60);
      if (minutes > 0) {
        await updateSpeakerMinutes(speakerId, minutes);
      }
    }

    // If we have messages, perform deep metacognitive reflection
    // This runs async to not block the response
    if (messages && messages.length > 0) {
      // Run reflection in background (don't await)
      performMetacognitiveReflection(messages, conversationId).catch(error => {
        console.error('Background metacognitive reflection failed:', error);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error ending conversation:', error);
    return NextResponse.json(
      { error: 'Failed to end conversation' },
      { status: 500 }
    );
  }
}
