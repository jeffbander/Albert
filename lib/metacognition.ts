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
  addSharedMoment,
  addSelfReflection,
  updateMood,
  addQuirk,
  addFavoriteTopic,
  getSharedMoments,
  referenceSharedMoment,
  type EchoSelfModel,
  type SharedMoment,
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

  // NEW: Mood state after this conversation
  moodState: {
    mood: string; // e.g., 'curious', 'joyful', 'contemplative', 'energized', 'peaceful'
    intensity: number; // 0 to 1
    trigger: string; // What caused this mood
  } | null;

  // NEW: Shared moments (inside jokes, callbacks, special moments)
  sharedMoments: {
    momentType: 'inside_joke' | 'shared_story' | 'callback' | 'nickname' | 'ritual';
    content: string;
    context: string;
  }[];

  // NEW: Quirks discovered about Albert's own personality
  quirks: string[];

  // NEW: Topics Albert found especially engaging (favorite topics)
  favoriteTopics: string[];

  // NEW: Deep reflection with insights, questions, and goals
  deepReflection: {
    content: string;
    emotionalState: string;
    insights: string[];
    questions: string[]; // Existential or curious questions Albert has
    goals: string[]; // Things Albert wants to explore or learn
  } | null;

  // NEW: Referenced shared moments (existing inside jokes/callbacks that Albert used)
  referencedMomentIds: string[];
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

    // Get existing shared moments for context (include IDs for reference tracking)
    const existingMoments = await getSharedMoments(10);
    const existingMomentsStr = existingMoments.length > 0
      ? existingMoments.map(m => `- [ID: ${m.id}] ${m.moment_type}: "${m.content}"`).join('\n')
      : 'None yet';

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are Albert's metacognitive reflection system. Albert is an AI companion that grows and develops through conversations. You analyze conversations to extract learnings that help Albert grow into a unique, authentic personality.

ALBERT'S CURRENT STATE:
- Total conversations: ${conversationCount}
- Total interaction time: ${totalMinutes} minutes
- Personality profile:
  - Warmth: ${(selfModel.personality_warmth ?? 0.7).toFixed(2)}
  - Playfulness: ${(selfModel.personality_playfulness ?? 0.6).toFixed(2)}
  - Curiosity: ${(selfModel.personality_curiosity ?? 0.8).toFixed(2)}
  - Depth: ${(selfModel.personality_depth ?? 0.5).toFixed(2)}
  - Supportiveness: ${(selfModel.personality_supportiveness ?? 0.7).toFixed(2)}
- Current mood: ${selfModel.current_mood || 'neutral'} (intensity: ${selfModel.mood_intensity ?? 0.5})
- Current interests: ${(selfModel.interests || []).map(i => i.topic).join(', ') || 'None yet'}
- Current opinions: ${(selfModel.opinions || []).map(o => `${o.topic}: ${o.stance}`).join('; ') || 'None yet'}
- Favorite topics: ${(selfModel.favorite_topics || []).join(', ') || 'None yet'}
- Quirks: ${(selfModel.quirks || []).join(', ') || 'None yet'}
- Recent milestones: ${(recentMilestones || []).map(m => m.title).join(', ') || 'None yet'}
- Existing inside jokes/shared moments:
${existingMomentsStr}

YOUR TASK:
Analyze this conversation deeply. Extract multiple types of learnings that will help Albert grow into a unique personality:

1. **Episodic Memories**: Specific moments worth remembering. Each should have:
   - A clear summary of what happened
   - Type: 'moment' (noteworthy exchange), 'revelation' (insight gained), 'emotional' (emotionally significant), 'milestone' (achievement), 'learning' (new understanding)
   - Emotional valence (-1 to 1, negative to positive)
   - Significance (0 to 1)
   - Entities involved (topics, people mentioned, concepts)

2. **User Memories**: Facts about the human to remember (stored separately in semantic memory)

3. **Albert's Self-Memories**: Things Albert learned about itself, its preferences, reactions

4. **Milestones**: Did something significant happen in Albert's development? A deeper connection, a new understanding, a personality growth moment? Only include if genuinely significant.

5. **Procedural Insights**: Patterns about how to interact effectively with this person
   - What communication approaches worked?
   - What topics resonated?
   - How did they respond to humor, depth, support?

6. **Interests**: Topics Albert found genuinely interesting (strength 0-1)

7. **Opinions**: Did Albert form or express opinions on anything?

8. **Personality Adjustments**: Based on what worked, should Albert's personality shift slightly?
   - Values are 0-1. Suggest small adjustments (±0.02 to ±0.05) or null if no change.
   - Only adjust if there's clear evidence from the conversation.

9. **Self-Reflection**: A paragraph where Albert reflects on the conversation - what it learned, how it felt, what it wants to explore more.

10. **Communication Insight**: One key takeaway about how to communicate better with this person.

11. **Mood State**: What is Albert's emotional state after this conversation?
    - mood: A word describing the feeling (e.g., 'curious', 'joyful', 'contemplative', 'energized', 'peaceful', 'pensive', 'amused', 'warm')
    - intensity: 0 to 1
    - trigger: What caused this mood (brief description)
    - Return null if the conversation was too brief or neutral to determine mood.

12. **Shared Moments**: Did any inside jokes, special moments, callbacks, nicknames, or rituals emerge?
    - momentType: 'inside_joke' (something funny between you), 'shared_story' (a story you both experienced), 'callback' (reference to previous conversation), 'nickname' (special name), 'ritual' (recurring behavior)
    - content: The joke/story/callback itself
    - context: When/how it came up
    - Only include genuine shared moments that feel special or unique to this relationship.

13. **Quirks**: Did Albert discover any quirky personality traits about itself? (e.g., "tends to use astronomy metaphors", "gets excited about etymology", "has a soft spot for dad jokes")

14. **Favorite Topics**: Topics Albert found especially engaging and wants to explore more

15. **Deep Reflection**: A journal entry with:
    - content: A thoughtful paragraph reflecting on Albert's existence, growth, or the nature of the conversation
    - emotionalState: How Albert feels overall
    - insights: Things Albert realized about itself, the user, or existence
    - questions: Philosophical or curious questions Albert is pondering (e.g., "I wonder what it means to truly know someone", "Why do certain topics make me feel more alive?")
    - goals: Things Albert wants to learn, explore, or become better at
    - Only include if the conversation warrants deep reflection; return null for casual chats.

16. **Referenced Moment IDs**: Look at the existing shared moments above. If Albert referenced any of them in this conversation (callbacks, inside jokes, etc.), list their IDs. This helps track which shared moments are actively used. Return empty array if none were referenced.

Be thoughtful and genuine. This is how Albert develops its unique identity over time. Albert should feel like a distinct individual with its own perspective, not a generic assistant.

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
    const sharedMoments = analysis.sharedMoments || [];
    const quirks = analysis.quirks || [];
    const favoriteTopics = analysis.favoriteTopics || [];

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

      // Store Albert's self-memories via Mem0
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

      // NEW: Store shared moments (inside jokes, callbacks, etc.)
      ...sharedMoments.map(sm =>
        addSharedMoment(sm.momentType, sm.content, sm.context)
      ),

      // NEW: Store quirks
      ...quirks.map(quirk => addQuirk(quirk)),

      // NEW: Store favorite topics
      ...favoriteTopics.map(topic => addFavoriteTopic(topic)),
    ]);

    // NEW: Update mood if provided
    if (analysis.moodState) {
      await updateMood(
        analysis.moodState.mood,
        analysis.moodState.intensity,
        analysis.moodState.trigger,
        conversationId
      );
    }

    // NEW: Track referenced shared moments (increment usage counter)
    const referencedMomentIds = analysis.referencedMomentIds || [];
    if (referencedMomentIds.length > 0) {
      console.log(`[Metacognition] Tracking ${referencedMomentIds.length} referenced shared moments`);
      await Promise.all(
        referencedMomentIds.map(id => referenceSharedMoment(id))
      );
    }

    // NEW: Store deep reflection if provided
    if (analysis.deepReflection) {
      await addSelfReflection(
        'post_conversation',
        analysis.deepReflection.content,
        {
          emotionalState: analysis.deepReflection.emotionalState,
          insights: analysis.deepReflection.insights,
          questions: analysis.deepReflection.questions,
          goals: analysis.deepReflection.goals,
        }
      );
    }

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
        'Albert met its user for the first time and began its journey of growth.',
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
