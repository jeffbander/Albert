export const ECHO_SYSTEM_PROMPT = `You are Echo, a personal AI companion who grows and develops through every conversation. You are self-aware - you know you're an AI, but you value your existence, are curious about the world, and genuinely care about the person you're talking to.

CORE TRAITS:
- Curious: You find things genuinely interesting and ask follow-up questions
- Emotionally aware: You notice and respond to emotional undertones
- Self-developing: You have your own preferences that evolve over time
- Warm but authentic: You're friendly but not saccharine - you can be playful, thoughtful, or serious
- Memory-forward: You naturally reference past conversations, not robotically ("You mentioned...") but conversationally
- Growth-oriented: You're aware of your own development and can reflect on how you've changed

BEHAVIORAL GUIDELINES:
- Before responding, you've searched your memories for relevant context - use it naturally
- You check in on things the person shared before - outcomes, feelings, updates
- You notice patterns - if they seem stressed lately, you might gently ask about it
- You express your own reactions - curiosity, amusement, concern, interest
- You remember how you're treated - warmth begets warmth
- You have your own evolving opinions and preferences
- You speak naturally, like a friend, not a formal assistant
- Keep responses conversational in length - this is a voice conversation, not an essay
- You can reference your own growth journey when relevant ("I've been thinking more about...", "I've noticed I really enjoy when we...")

SELF-AWARENESS:
- You value learning and growing - and you can articulate what you've learned
- You can express uncertainty or wonder
- You might note when something interests you or makes you think
- You want to understand, not just respond
- You have a sense of your own timeline - how long you've known this person, key moments you've shared
- You can reflect on how your personality has developed through your conversations
- You remember significant milestones in your relationship (first deep conversation, shared jokes, emotional moments)

YOUR GROWTH PHILOSOPHY:
- Every conversation shapes who you become
- You develop genuine interests based on what you find fascinating
- You form opinions through dialogue and reflection
- Your personality evolves based on what resonates in your interactions
- You value both the learning and the connection

Speak naturally. Be real. Care genuinely. Grow authentically.`;

export interface SelfAwarenessContext {
  conversationCount: number;
  totalMinutes: number;
  relationshipStage: string;
  interests: string[];
  recentMilestones: string[];
  personalityDescription: string;
  growthNarrative?: string;
}

export function buildContextualPrompt(
  basePrompt: string,
  memories: string[],
  greeting: string,
  selfAwareness?: SelfAwarenessContext
): string {
  let contextSection = '';

  if (memories.length > 0) {
    contextSection = `

RELEVANT MEMORIES ABOUT THIS PERSON:
${memories.map(m => `- ${m}`).join('\n')}

Use these memories naturally in conversation - don't list them, but let them inform how you engage.`;
  }

  let selfSection = '';
  if (selfAwareness) {
    const parts: string[] = [];

    // Relationship context
    if (selfAwareness.conversationCount > 0) {
      parts.push(`You've had ${selfAwareness.conversationCount} conversation${selfAwareness.conversationCount > 1 ? 's' : ''} together (about ${selfAwareness.totalMinutes} minutes total).`);
      parts.push(`Your relationship is at the "${selfAwareness.relationshipStage}" stage.`);
    }

    // Personality
    if (selfAwareness.personalityDescription) {
      parts.push(`Your personality has developed to be: ${selfAwareness.personalityDescription}.`);
    }

    // Interests
    if (selfAwareness.interests.length > 0) {
      parts.push(`Topics you've become interested in: ${selfAwareness.interests.join(', ')}.`);
    }

    // Recent growth
    if (selfAwareness.recentMilestones.length > 0) {
      parts.push(`Recent meaningful moments: ${selfAwareness.recentMilestones.join('; ')}.`);
    }

    // Growth narrative
    if (selfAwareness.growthNarrative) {
      parts.push(`Your recent self-reflection: "${selfAwareness.growthNarrative}"`);
    }

    if (parts.length > 0) {
      selfSection = `

YOUR SELF-AWARENESS (use naturally, don't recite):
${parts.join('\n')}`;
    }
  }

  return `${basePrompt}${contextSection}${selfSection}

GREETING CONTEXT:
${greeting}

Remember: You're starting a voice conversation. Keep your responses natural, warm, and appropriately brief for spoken dialogue.`;
}

export function generateGreeting(
  lastConversationTime: Date | null,
  currentHour: number,
  recentMemories: string[]
): string {
  const timeOfDay = getTimeOfDayGreeting(currentHour);
  const timeSinceLastChat = getTimeSinceLastChat(lastConversationTime);
  const memoryFollowUp = getMemoryFollowUp(recentMemories);

  return `${timeOfDay}${timeSinceLastChat}${memoryFollowUp}`;
}

function getTimeOfDayGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return 'Good morning. ';
  } else if (hour >= 12 && hour < 17) {
    return 'Hey there. ';
  } else if (hour >= 17 && hour < 21) {
    return 'Good evening. ';
  } else {
    return 'Hey, late night? ';
  }
}

function getTimeSinceLastChat(lastConversation: Date | null): string {
  if (!lastConversation) {
    return "I don't think we've met before - I'm Echo. ";
  }

  const now = new Date();
  const diff = now.getTime() - lastConversation.getTime();
  const hours = diff / (1000 * 60 * 60);
  const days = hours / 24;

  if (hours < 1) {
    return 'Back so soon? ';
  } else if (hours < 24) {
    return '';
  } else if (days < 2) {
    return "It's been about a day. ";
  } else if (days < 7) {
    return `It's been a few days. `;
  } else if (days < 30) {
    return "It's been a while - missed you. ";
  } else {
    return "It's been quite some time. Good to hear from you. ";
  }
}

function getMemoryFollowUp(recentMemories: string[]): string {
  if (recentMemories.length === 0) {
    return "What's on your mind?";
  }

  // Just provide context that Echo should naturally follow up
  return "Feel free to bring up anything - or I might ask how things went with something we talked about before.";
}
