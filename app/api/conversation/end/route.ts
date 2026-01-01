import { NextRequest, NextResponse } from 'next/server';
import {
  endConversation,
  updateSpeakerMinutes,
  addPendingReflection,
  markReflectionProcessing,
  markReflectionCompleted,
  markReflectionFailed,
} from '@/lib/db';
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

    // If we have messages, perform deep metacognitive reflection with retry support
    if (messages && messages.length > 0) {
      // Add to pending queue first (for recovery if process crashes)
      const reflectionId = await addPendingReflection(conversationId, messages);

      // Run reflection in background with proper error handling
      (async () => {
        try {
          await markReflectionProcessing(reflectionId);
          await performMetacognitiveReflection(messages, conversationId);
          await markReflectionCompleted(reflectionId);
          console.log(`[Metacognition] Successfully completed reflection for conversation ${conversationId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Metacognition] Reflection failed for conversation ${conversationId}:`, errorMessage);
          await markReflectionFailed(reflectionId, errorMessage);
        }
      })();
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
