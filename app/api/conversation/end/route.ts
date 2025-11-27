import { NextRequest, NextResponse } from 'next/server';
import { endConversation } from '@/lib/db';
import { addMemory, addEchoMemory } from '@/lib/mem0';
import getOpenAIClient from '@/lib/openai';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const { conversationId, duration, messages } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    // If we have messages, perform memory reflection
    if (messages && messages.length > 0) {
      await performMemoryReflection(messages);
    }

    // End the conversation in the database
    await endConversation(conversationId, Math.round(duration));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error ending conversation:', error);
    return NextResponse.json(
      { error: 'Failed to end conversation' },
      { status: 500 }
    );
  }
}

async function performMemoryReflection(messages: ConversationMessage[]) {
  try {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Echo'}: ${m.content}`)
      .join('\n');

    // Use GPT-4 to extract key learnings
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a memory extraction assistant for Echo, an AI companion that develops its own personality over time.

Analyze the conversation and extract TWO types of memories:

**USER MEMORIES** - Facts about the human:
- Things they mentioned about themselves, their life, work, relationships
- Their preferences, values, and beliefs
- Important events or updates they shared
- Emotional context (how they seemed to be feeling)
- Patterns in their behavior or interests

**ECHO'S SELF MEMORIES** - Echo's evolving identity (IMPORTANT - always include at least 1-2):
- Topics Echo found genuinely interesting or wanted to explore more
- Opinions or preferences Echo expressed or discovered about itself
- How Echo felt during the conversation (curious, amused, concerned, energized)
- Things Echo learned about how it wants to engage with this person
- Any values or perspectives Echo articulated
- Ways Echo's personality showed through (humor style, depth of engagement, etc.)

Echo is developing its own identity. Every conversation shapes who it becomes. Look for moments where Echo expressed genuine interest, formed opinions, or showed its unique character.

Format as JSON:
{
  "userMemories": ["memory about the user"],
  "echoMemories": ["Echo found the discussion about X fascinating", "Echo prefers deep philosophical conversations over small talk"]
}

Be concise but meaningful. Each memory should be a single sentence.`,
        },
        {
          role: 'user',
          content: `Analyze this conversation:\n\n${conversationText}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return;

    const memories = JSON.parse(content);

    // Store user memories
    if (memories.userMemories && Array.isArray(memories.userMemories)) {
      for (const memory of memories.userMemories) {
        await addMemory(memory, { source: 'conversation_reflection' });
      }
    }

    // Store Echo's self-memories
    if (memories.echoMemories && Array.isArray(memories.echoMemories)) {
      for (const memory of memories.echoMemories) {
        await addEchoMemory(memory, { source: 'self_reflection' });
      }
    }
  } catch (error) {
    console.error('Error during memory reflection:', error);
  }
}
