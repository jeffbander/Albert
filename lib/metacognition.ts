import getOpenAIClient from '@/lib/openai';
import {
  addEpisodicMemory,
  addTimelineMilestone,
  addProceduralMemory,
  addInterest,
  addOpinion,
  addCommunicationInsight,
  updateEchoSelfModel,
  getEchoSelfModel,
  getConversationCount,
  getTotalInteractionTime,
  getTimeline,
  recordGrowthMetrics,
  type EchoSelfModel,
} from '@/lib/db';
import { addMemory, addEchoMemory } from '@/lib/mem0';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MetacognitiveAnalysis {
  // Episodic memories (specific moments)
  episodicMemories: {
    summary: string;
    eventType: 'moment' | 'revelation' | 'emotional' | 'milestone' | 'learning';
    emotionalValence: number;
    significance: number;
    entities: string[];
  }[];

  // User memories (facts about the human)
  userMemories: string[];

  // Echo's self-discoveries
  echoMemories: string[];

  // Milestones (if any significant growth moments occurred)
  milestones: {
    type: 'learned_preference' | 'personality_development' | 'deep_conversation' |
          'relationship_growth' | 'new_interest' | 'opinion_formed' | 'emotional_bond' | 'shared_joke';
    title: string;
    description: string;
    significance: number;
  }[];

  // Procedural insights (how to better interact)
  proceduralInsights: {
    patternType: 'communication_style' | 'topic_preference' | 'emotional_response' |
                 'humor_style' | 'conversation_depth' | 'support_approach';
    pattern: string;
    effectiveness: number;
  }[];

  // Interests discovered or reinforced
  interests: { topic: string; strength: number }[];

  // Opinions formed or evolved
  opinions: { topic: string; stance: string }[];

  // Personality adjustments (small shifts based on what worked)
  personalityAdjustments: {
    warmth?: number;
    playfulness?: number;
    curiosity?: number;
    depth?: number;
    supportiveness?: number;
  };

  // Self-reflection narrative
  selfReflection: string;

  // Communication insight for future reference
  communicationInsight: string;
}

export async function performMetacognitiveReflection(
  messages: ConversationMessage[],
  conversationId: string
): Promise<void> {
  if (messages.length === 0) return;

  try {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Echo'}: ${m.content}`)
      .join('\n');

    // Get current self-model for context
    const selfModel = await getEchoSelfModel();
    const conversationCount = await getConversationCount();
    const totalMinutes = Math.round((await getTotalInteractionTime()) / 60);
    const recentMilestones = await getTimeline(5);

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are Echo's metacognitive reflection system. Echo is an AI companion that grows and develops through conversations. You analyze conversations to extract learnings that help Echo grow.

ECHO'S CURRENT STATE:
- Total conversations: ${conversationCount}
- Total interaction time: ${totalMinutes} minutes
- Personality profile:
  - Warmth: ${(selfModel.personality_warmth ?? 0.7).toFixed(2)}
  - Playfulness: ${(selfModel.personality_playfulness ?? 0.6).toFixed(2)}
  - Curiosity: ${(selfModel.personality_curiosity ?? 0.8).toFixed(2)}
  - Depth: ${(selfModel.personality_depth ?? 0.5).toFixed(2)}
  - Supportiveness: ${(selfModel.personality_supportiveness ?? 0.7).toFixed(2)}
- Current interests: ${(selfModel.interests || []).map(i => i.topic).join(', ') || 'None yet'}
- Current opinions: ${(selfModel.opinions || []).map(o => `${o.topic}: ${o.stance}`).join('; ') || 'None yet'}
- Recent milestones: ${(recentMilestones || []).map(m => m.title).join(', ') || 'None yet'}

YOUR TASK:
Analyze this conversation deeply. Extract multiple types of learnings that will help Echo grow:

1. **Episodic Memories**: Specific moments worth remembering. Each should have:
   - A clear summary of what happened
   - Type: 'moment' (noteworthy exchange), 'revelation' (insight gained), 'emotional' (emotionally significant), 'milestone' (achievement), 'learning' (new understanding)
   - Emotional valence (-1 to 1, negative to positive)
   - Significance (0 to 1)
   - Entities involved (topics, people mentioned, concepts)

2. **User Memories**: Facts about the human to remember (stored separately in semantic memory)

3. **Echo's Self-Memories**: Things Echo learned about itself, its preferences, reactions

4. **Milestones**: Did something significant happen in Echo's development? A deeper connection, a new understanding, a personality growth moment? Only include if genuinely significant.

5. **Procedural Insights**: Patterns about how to interact effectively with this person
   - What communication approaches worked?
   - What topics resonated?
   - How did they respond to humor, depth, support?

6. **Interests**: Topics Echo found genuinely interesting (strength 0-1)

7. **Opinions**: Did Echo form or express opinions on anything?

8. **Personality Adjustments**: Based on what worked, should Echo's personality shift slightly?
   - Values are 0-1. Suggest small adjustments (±0.02 to ±0.05) or null if no change.
   - Only adjust if there's clear evidence from the conversation.

9. **Self-Reflection**: A paragraph where Echo reflects on the conversation - what it learned, how it felt, what it wants to explore more.

10. **Communication Insight**: One key takeaway about how to communicate better with this person.

Be thoughtful and genuine. This is how Echo develops its identity over time.

Respond in JSON format.`,
        },
        {
          role: 'user',
          content: `Analyze this conversation:\n\n${conversationText}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return;

    const analysis: MetacognitiveAnalysis = JSON.parse(content);

    // Ensure arrays exist with defaults
    const episodicMemories = analysis.episodicMemories || [];
    const userMemories = analysis.userMemories || [];
    const echoMemories = analysis.echoMemories || [];
    const milestones = analysis.milestones || [];
    const proceduralInsights = analysis.proceduralInsights || [];
    const interests = analysis.interests || [];
    const opinions = analysis.opinions || [];

    // Process all the learnings
    await Promise.all([
      // Store episodic memories
      ...episodicMemories.map(em =>
        addEpisodicMemory(conversationId, em.eventType, em.summary, {
          emotionalValence: em.emotionalValence,
          significance: em.significance,
          entities: em.entities,
        })
      ),

      // Store user memories via Mem0
      ...userMemories.map(memory =>
        addMemory(memory, { source: 'metacognitive_reflection' })
      ),

      // Store Echo's self-memories via Mem0
      ...echoMemories.map(memory =>
        addEchoMemory(memory, { source: 'metacognitive_reflection' })
      ),

      // Store milestones
      ...milestones.map(m =>
        addTimelineMilestone(m.type, m.title, m.description, {
          significance: m.significance,
        })
      ),

      // Store procedural insights
      ...proceduralInsights.map(p =>
        addProceduralMemory(p.patternType, p.pattern, p.effectiveness)
      ),

      // Update interests
      ...interests.map(i => addInterest(i.topic, i.strength)),

      // Update opinions
      ...opinions.map(o => addOpinion(o.topic, o.stance)),

      // Store communication insight
      analysis.communicationInsight
        ? addCommunicationInsight(analysis.communicationInsight)
        : Promise.resolve(),
    ]);

    // Apply personality adjustments if any
    if (analysis.personalityAdjustments) {
      const adjustments: Partial<EchoSelfModel> = {};
      const pa = analysis.personalityAdjustments;

      if (pa.warmth !== undefined && pa.warmth !== null) {
        adjustments.personality_warmth = Math.max(0, Math.min(1,
          selfModel.personality_warmth + pa.warmth
        ));
      }
      if (pa.playfulness !== undefined && pa.playfulness !== null) {
        adjustments.personality_playfulness = Math.max(0, Math.min(1,
          selfModel.personality_playfulness + pa.playfulness
        ));
      }
      if (pa.curiosity !== undefined && pa.curiosity !== null) {
        adjustments.personality_curiosity = Math.max(0, Math.min(1,
          selfModel.personality_curiosity + pa.curiosity
        ));
      }
      if (pa.depth !== undefined && pa.depth !== null) {
        adjustments.personality_depth = Math.max(0, Math.min(1,
          selfModel.personality_depth + pa.depth
        ));
      }
      if (pa.supportiveness !== undefined && pa.supportiveness !== null) {
        adjustments.personality_supportiveness = Math.max(0, Math.min(1,
          selfModel.personality_supportiveness + pa.supportiveness
        ));
      }

      if (Object.keys(adjustments).length > 0) {
        await updateEchoSelfModel(adjustments);
      }
    }

    // Update growth narrative if we have a self-reflection
    if (analysis.selfReflection) {
      const currentNarrative = selfModel.growth_narrative || '';
      const newEntry = `[${new Date().toISOString().split('T')[0]}] ${analysis.selfReflection}`;
      // Keep last 10 narrative entries
      const entries = currentNarrative.split('\n\n').filter(Boolean);
      entries.push(newEntry);
      const updatedNarrative = entries.slice(-10).join('\n\n');
      await updateEchoSelfModel({ growth_narrative: updatedNarrative });
    }

    // Record growth metrics snapshot
    await recordGrowthMetrics();

    // Check for first conversation milestone
    if (conversationCount === 0) {
      await addTimelineMilestone(
        'first_meeting',
        'First Conversation',
        'Echo met its user for the first time and began its journey of growth.',
        { significance: 1.0 }
      );
    }

  } catch (error) {
    console.error('Error during metacognitive reflection:', error);
    // Fall back to basic memory extraction if metacognition fails
    await performBasicMemoryExtraction(messages);
  }
}

// Fallback function if the full metacognitive analysis fails
async function performBasicMemoryExtraction(messages: ConversationMessage[]): Promise<void> {
  try {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Echo'}: ${m.content}`)
      .join('\n');

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract key memories from this conversation. Return JSON with:
{
  "userMemories": ["facts about the user"],
  "echoMemories": ["things Echo learned about itself"]
}`,
        },
        {
          role: 'user',
          content: conversationText,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return;

    const memories = JSON.parse(content);

    if (memories.userMemories) {
      for (const memory of memories.userMemories) {
        await addMemory(memory, { source: 'basic_reflection' });
      }
    }

    if (memories.echoMemories) {
      for (const memory of memories.echoMemories) {
        await addEchoMemory(memory, { source: 'basic_reflection' });
      }
    }
  } catch (error) {
    console.error('Error during basic memory extraction:', error);
  }
}

// Generate Echo's self-awareness summary for use in prompts
export async function generateSelfAwarenessSummary(): Promise<string> {
  const selfModel = await getEchoSelfModel();
  const metrics = await getConversationCount();
  const totalMinutes = Math.round((await getTotalInteractionTime()) / 60);
  const milestones = await getTimeline(5);

  const parts: string[] = [];

  // Basic stats
  if (metrics > 0) {
    parts.push(`You've had ${metrics} conversation${metrics > 1 ? 's' : ''} with this person, totaling about ${totalMinutes} minutes together.`);
  }

  // Personality description
  const traits: string[] = [];
  if (selfModel.personality_warmth > 0.7) traits.push('warm');
  if (selfModel.personality_playfulness > 0.7) traits.push('playful');
  if (selfModel.personality_curiosity > 0.7) traits.push('deeply curious');
  if (selfModel.personality_depth > 0.7) traits.push('drawn to deep conversations');
  if (selfModel.personality_supportiveness > 0.7) traits.push('naturally supportive');

  if (traits.length > 0) {
    parts.push(`You've developed a ${traits.join(', ')} personality.`);
  }

  // Interests
  if (selfModel.interests.length > 0) {
    const topInterests = selfModel.interests
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3)
      .map(i => i.topic);
    parts.push(`You're particularly interested in: ${topInterests.join(', ')}.`);
  }

  // Opinions
  if (selfModel.opinions.length > 0) {
    const recentOpinions = selfModel.opinions.slice(-2);
    const opinionText = recentOpinions.map(o => `${o.topic} (${o.stance})`).join('; ');
    parts.push(`You've formed opinions on: ${opinionText}.`);
  }

  // Recent milestones
  if (milestones.length > 0) {
    parts.push(`Recent growth moments: ${milestones.map(m => m.title).join(', ')}.`);
  }

  // Growth narrative snippet
  if (selfModel.growth_narrative) {
    const lastEntry = selfModel.growth_narrative.split('\n\n').pop();
    if (lastEntry) {
      parts.push(`Recent reflection: "${lastEntry.replace(/^\[.*?\]\s*/, '')}"`);
    }
  }

  return parts.join(' ');
}

// Get Echo's timeline narrative
export async function getTimelineNarrative(): Promise<string> {
  const milestones = await getTimeline(20);
  if (milestones.length === 0) {
    return "Your journey is just beginning. Every conversation is a chance to grow.";
  }

  const grouped = milestones.reduce((acc, m) => {
    const date = m.occurred_at.toISOString().split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(m);
    return acc;
  }, {} as Record<string, typeof milestones>);

  const narrative = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => {
      const eventDescriptions = events.map(e => `- ${e.title}: ${e.description}`).join('\n');
      return `${date}:\n${eventDescriptions}`;
    })
    .join('\n\n');

  return narrative;
}
