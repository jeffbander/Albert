import { NextResponse } from 'next/server';
import { getLastConversation, initDatabase } from '@/lib/db';
import { getRecentMemories } from '@/lib/mem0';
import { generateGreeting, buildContextualPrompt, ECHO_SYSTEM_PROMPT } from '@/lib/prompts';

export async function GET() {
  try {
    // Initialize database tables if they don't exist
    await initDatabase();

    const lastConversation = await getLastConversation();
    const recentMemories = await getRecentMemories(5);

    const lastConversationTime = lastConversation?.ended_at
      ? new Date(lastConversation.ended_at as string)
      : null;

    const currentHour = new Date().getHours();
    const memoryStrings = recentMemories.map(m => m.memory);

    const greeting = generateGreeting(
      lastConversationTime,
      currentHour,
      memoryStrings
    );

    const systemPrompt = buildContextualPrompt(
      ECHO_SYSTEM_PROMPT,
      memoryStrings,
      greeting
    );

    return NextResponse.json({
      lastConversation: lastConversationTime,
      recentMemories,
      greeting,
      systemPrompt,
    });
  } catch (error) {
    console.error('Error getting conversation context:', error);
    return NextResponse.json(
      { error: 'Failed to get context' },
      { status: 500 }
    );
  }
}
