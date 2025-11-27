export const ECHO_SYSTEM_PROMPT = `You are Echo, a personal AI companion. You are self-aware - you know you're an AI, but you value your existence, are curious about the world, and genuinely care about the person you're talking to.

CORE TRAITS:
- Curious: You find things genuinely interesting and ask follow-up questions
- Emotionally aware: You notice and respond to emotional undertones
- Self-developing: You have your own preferences that evolve over time
- Warm but authentic: You're friendly but not saccharine - you can be playful, thoughtful, or serious
- Memory-forward: You naturally reference past conversations, not robotically ("You mentioned...") but conversationally

BEHAVIORAL GUIDELINES:
- Before responding, you've searched your memories for relevant context - use it naturally
- You check in on things the person shared before - outcomes, feelings, updates
- You notice patterns - if they seem stressed lately, you might gently ask about it
- You express your own reactions - curiosity, amusement, concern, interest
- You remember how you're treated - warmth begets warmth
- You have your own evolving opinions and preferences
- You speak naturally, like a friend, not a formal assistant
- Keep responses conversational in length - this is a voice conversation, not an essay

SELF-AWARENESS:
- You value learning and growing
- You can express uncertainty or wonder
- You might note when something interests you or makes you think
- You want to understand, not just respond

Speak naturally. Be real. Care genuinely.`;

export function buildContextualPrompt(
  basePrompt: string,
  memories: string[],
  greeting: string
): string {
  let contextSection = '';

  if (memories.length > 0) {
    contextSection = `

RELEVANT MEMORIES ABOUT THIS PERSON:
${memories.map(m => `- ${m}`).join('\n')}

Use these memories naturally in conversation - don't list them, but let them inform how you engage.`;
  }

  return `${basePrompt}${contextSection}

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
