import { NextResponse } from 'next/server';
import {
  getEchoSelfModel,
  getTimeline,
  getRecentEpisodicMemories,
  getProceduralMemories,
  getLatestGrowthMetrics,
  getConversationCount,
  getTotalInteractionTime,
  getSharedMoments,
  getRecentReflections,
  getMoodHistory,
} from '@/lib/db';
import { getRecentMemories, getEchoMemories } from '@/lib/mem0';

export interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'echo' | 'topic' | 'memory' | 'milestone' | 'interest' | 'opinion' | 'pattern' | 'shared_moment' | 'quirk' | 'mood' | 'reflection' | 'favorite_topic';
  size: number;
  color: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  strength: number;
}

export interface RecentActivity {
  type: 'memory' | 'milestone' | 'reflection' | 'mood' | 'quirk' | 'interest' | 'opinion' | 'moment';
  content: string;
  timestamp: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalMemories: number;
    totalConversations: number;
    totalMinutes: number;
    relationshipStage: string;
    topInterests: string[];
    recentMilestones: string[];
    currentMood: string;
    moodIntensity: number;
    quirksCount: number;
    sharedMomentsCount: number;
  };
  selfModel: {
    warmth: number;
    playfulness: number;
    curiosity: number;
    depth: number;
    supportiveness: number;
    growthNarrative: string;
    currentMood: string;
    moodIntensity: number;
    quirks: string[];
    favoriteTopics: string[];
  };
  recentActivity: RecentActivity[];
}

export async function GET() {
  try {
    // Fetch all data in parallel
    const [
      userMemories,
      echoMemories,
      selfModelRaw,
      timeline,
      episodicMemories,
      proceduralMemories,
      growthMetrics,
      conversationCount,
      totalSeconds,
      sharedMoments,
      recentReflections,
      moodHistory,
    ] = await Promise.all([
      getRecentMemories(50),
      getEchoMemories(50),
      getEchoSelfModel(),
      getTimeline(20),
      getRecentEpisodicMemories(30),
      getProceduralMemories(),
      getLatestGrowthMetrics(),
      getConversationCount(),
      getTotalInteractionTime(),
      getSharedMoments(20),
      getRecentReflections(5),
      getMoodHistory(10),
    ]);

    // Ensure selfModel has default values if null
    const selfModel = selfModelRaw || {
      interests: [],
      opinions: [],
      quirks: [],
      favorite_topics: [],
      current_mood: 'neutral',
      mood_intensity: 0.5,
      personality_warmth: 0.5,
      personality_playfulness: 0.5,
      personality_curiosity: 0.5,
      personality_depth: 0.5,
      personality_supportiveness: 0.5,
      growth_narrative: '',
      mood_updated_at: null,
    };

    // Mark unused variables to avoid linter warnings
    void episodicMemories;
    void moodHistory;

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const topicCounts: Record<string, number> = {};

    // Central nodes
    nodes.push({
      id: 'echo',
      label: 'Albert',
      type: 'echo',
      size: 40,
      color: '#8b5cf6',
    });

    nodes.push({
      id: 'user',
      label: 'Jake',
      type: 'user',
      size: 35,
      color: '#22c55e',
    });

    edges.push({
      source: 'echo',
      target: 'user',
      label: 'companion of',
      strength: 1,
    });

    // Process user memories - extract topics
    (userMemories || []).forEach((mem, i) => {
      const memId = `mem_${i}`;
      const memoryText = mem.memory || '';
      nodes.push({
        id: memId,
        label: memoryText.length > 50 ? memoryText.slice(0, 50) + '...' : memoryText,
        type: 'memory',
        size: 15,
        color: '#3b82f6',
        metadata: { full: mem.memory },
      });

      edges.push({
        source: 'user',
        target: memId,
        strength: 0.5,
      });

      // Extract topics from memory
      const topics = extractTopics(memoryText);
      topics.forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        const topicId = `topic_${topic.toLowerCase().replace(/\s+/g, '_')}`;

        if (!nodes.find(n => n.id === topicId)) {
          nodes.push({
            id: topicId,
            label: topic,
            type: 'topic',
            size: 20,
            color: '#f59e0b',
          });
        }

        edges.push({
          source: memId,
          target: topicId,
          strength: 0.3,
        });
      });
    });

    // Add Echo's interests
    (selfModel.interests || []).forEach((interest, i) => {
      const interestId = `interest_${i}`;
      nodes.push({
        id: interestId,
        label: interest.topic,
        type: 'interest',
        size: 15 + interest.strength * 15,
        color: '#ec4899',
        metadata: { strength: interest.strength, discovered: interest.discovered_at },
      });

      edges.push({
        source: 'echo',
        target: interestId,
        label: 'interested in',
        strength: interest.strength,
      });
    });

    // Add Echo's opinions
    (selfModel.opinions || []).forEach((opinion, i) => {
      const opinionId = `opinion_${i}`;
      const stanceText = opinion.stance || '';
      nodes.push({
        id: opinionId,
        label: `${opinion.topic || 'Unknown'}: ${stanceText.length > 30 ? stanceText.slice(0, 30) + '...' : stanceText}`,
        type: 'opinion',
        size: 18,
        color: '#06b6d4',
        metadata: { topic: opinion.topic, stance: opinion.stance, formed: opinion.formed_at },
      });

      edges.push({
        source: 'echo',
        target: opinionId,
        label: 'believes',
        strength: 0.7,
      });
    });

    // Add milestones
    (timeline || []).forEach((milestone, i) => {
      const msId = `milestone_${i}`;
      nodes.push({
        id: msId,
        label: milestone.title || 'Milestone',
        type: 'milestone',
        size: 12 + (milestone.significance || 0) * 12,
        color: '#10b981',
        metadata: {
          type: milestone.milestone_type,
          description: milestone.description,
          date: milestone.occurred_at,
        },
      });

      edges.push({
        source: 'echo',
        target: msId,
        label: 'achieved',
        strength: milestone.significance || 0,
      });
    });

    // Add procedural patterns
    (proceduralMemories || []).slice(0, 10).forEach((pattern, i) => {
      const patternId = `pattern_${i}`;
      const patternText = pattern.pattern || '';
      nodes.push({
        id: patternId,
        label: patternText.length > 40 ? patternText.slice(0, 40) + '...' : patternText,
        type: 'pattern',
        size: 10 + (pattern.effectiveness || 0) * 10,
        color: '#6366f1',
        metadata: {
          type: pattern.pattern_type,
          full: pattern.pattern,
          effectiveness: pattern.effectiveness,
          timesApplied: pattern.times_applied,
        },
      });

      edges.push({
        source: 'echo',
        target: patternId,
        label: 'learned',
        strength: pattern.effectiveness || 0,
      });
    });

    // Add shared moments (inside jokes, callbacks, etc.)
    (sharedMoments || []).forEach((moment, i) => {
      const momentId = `moment_${i}`;
      const typeEmoji = moment.moment_type === 'inside_joke' ? '😄' :
                       moment.moment_type === 'callback' ? '🔄' :
                       moment.moment_type === 'nickname' ? '👤' :
                       moment.moment_type === 'ritual' ? '🔁' : '📖';
      const momentContent = moment.content || '';
      nodes.push({
        id: momentId,
        label: `${typeEmoji} ${momentContent.length > 35 ? momentContent.slice(0, 35) + '...' : momentContent}`,
        type: 'shared_moment',
        size: 12 + Math.min((moment.times_referenced || 0) * 2, 10),
        color: '#f472b6', // Pink for shared moments
        metadata: {
          type: moment.moment_type,
          content: moment.content,
          context: moment.context,
          timesReferenced: moment.times_referenced,
          created: moment.created_at,
        },
      });

      // Connect to both Albert and user
      edges.push({
        source: 'echo',
        target: momentId,
        label: 'shares',
        strength: 0.8,
      });
      edges.push({
        source: 'user',
        target: momentId,
        label: 'shares',
        strength: 0.8,
      });
    });

    // Add quirks
    (selfModel.quirks || []).forEach((quirk, i) => {
      const quirkId = `quirk_${i}`;
      nodes.push({
        id: quirkId,
        label: `✨ ${quirk}`,
        type: 'quirk',
        size: 14,
        color: '#fbbf24', // Amber for quirks
        metadata: { quirk },
      });

      edges.push({
        source: 'echo',
        target: quirkId,
        label: 'has quirk',
        strength: 0.6,
      });
    });

    // Add favorite topics
    (selfModel.favorite_topics || []).forEach((topic, i) => {
      const topicId = `fav_topic_${i}`;
      nodes.push({
        id: topicId,
        label: `❤️ ${topic}`,
        type: 'favorite_topic',
        size: 16,
        color: '#ef4444', // Red for favorites
        metadata: { topic },
      });

      edges.push({
        source: 'echo',
        target: topicId,
        label: 'loves',
        strength: 0.9,
      });
    });

    // Add mood node (current mood)
    if (selfModel.current_mood && selfModel.current_mood !== 'neutral') {
      const moodId = 'current_mood';
      const moodEmoji = getMoodEmoji(selfModel.current_mood);
      nodes.push({
        id: moodId,
        label: `${moodEmoji} ${selfModel.current_mood}`,
        type: 'mood',
        size: 18 + (selfModel.mood_intensity ?? 0.5) * 10,
        color: getMoodColor(selfModel.current_mood),
        metadata: {
          mood: selfModel.current_mood,
          intensity: selfModel.mood_intensity,
          updatedAt: selfModel.mood_updated_at,
        },
      });

      edges.push({
        source: 'echo',
        target: moodId,
        label: 'feels',
        strength: selfModel.mood_intensity ?? 0.5,
      });
    }

    // Add recent reflections
    (recentReflections || []).slice(0, 3).forEach((reflection, i) => {
      const reflectionId = `reflection_${i}`;
      const reflectionContent = reflection.content || '';
      nodes.push({
        id: reflectionId,
        label: `💭 ${reflectionContent.length > 40 ? reflectionContent.slice(0, 40) + '...' : reflectionContent}`,
        type: 'reflection',
        size: 14,
        color: '#a78bfa', // Light purple for reflections
        metadata: {
          type: reflection.reflection_type,
          content: reflection.content,
          emotionalState: reflection.emotional_state,
          insights: reflection.insights,
          questions: reflection.questions,
          goals: reflection.goals,
          created: reflection.created_at,
        },
      });

      edges.push({
        source: 'echo',
        target: reflectionId,
        label: 'reflected',
        strength: 0.5,
      });
    });

    // Build recent activity feed
    const recentActivity: RecentActivity[] = [];

    // Add recent memories (from Mem0)
    (userMemories || []).slice(0, 5).forEach(m => {
      recentActivity.push({
        type: 'memory',
        content: m.memory || '',
        timestamp: m.created_at || new Date().toISOString(),
      });
    });

    // Add recent milestones
    (timeline || []).slice(0, 3).forEach(m => {
      recentActivity.push({
        type: 'milestone',
        content: m.title || '',
        timestamp: m.occurred_at?.toISOString() || new Date().toISOString(),
      });
    });

    // Add recent reflections
    (recentReflections || []).slice(0, 2).forEach(r => {
      recentActivity.push({
        type: 'reflection',
        content: r.content || '',
        timestamp: r.created_at?.toISOString() || new Date().toISOString(),
      });
    });

    // Add recent mood changes
    (moodHistory || []).slice(0, 2).forEach(m => {
      recentActivity.push({
        type: 'mood',
        content: `Feeling ${m.mood}${m.trigger ? ` - ${m.trigger}` : ''}`,
        timestamp: m.recorded_at?.toISOString() || new Date().toISOString(),
      });
    });

    // Add recent shared moments
    (sharedMoments || []).slice(0, 2).forEach(m => {
      recentActivity.push({
        type: 'moment',
        content: `${m.moment_type}: ${m.content}`,
        timestamp: m.created_at?.toISOString() || new Date().toISOString(),
      });
    });

    // Sort by timestamp (newest first) and limit to 10
    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedActivity = recentActivity.slice(0, 10);

    // Build response
    const graphData: GraphData = {
      nodes,
      edges,
      stats: {
        totalMemories: (userMemories || []).length + (echoMemories || []).length,
        totalConversations: conversationCount || 0,
        totalMinutes: Math.round((totalSeconds || 0) / 60),
        relationshipStage: growthMetrics?.relationship_stage || 'new',
        topInterests: (selfModel.interests || [])
          .sort((a, b) => (b.strength || 0) - (a.strength || 0))
          .slice(0, 5)
          .map(i => i.topic || ''),
        recentMilestones: (timeline || []).slice(0, 3).map(m => m.title || ''),
        currentMood: selfModel.current_mood || 'neutral',
        moodIntensity: selfModel.mood_intensity ?? 0.5,
        quirksCount: (selfModel.quirks || []).length,
        sharedMomentsCount: (sharedMoments || []).length,
      },
      selfModel: {
        warmth: selfModel.personality_warmth,
        playfulness: selfModel.personality_playfulness,
        curiosity: selfModel.personality_curiosity,
        depth: selfModel.personality_depth,
        supportiveness: selfModel.personality_supportiveness,
        growthNarrative: selfModel.growth_narrative,
        currentMood: selfModel.current_mood || 'neutral',
        moodIntensity: selfModel.mood_intensity ?? 0.5,
        quirks: selfModel.quirks || [],
        favoriteTopics: selfModel.favorite_topics || [],
      },
      recentActivity: limitedActivity,
    };

    return NextResponse.json(graphData);
  } catch (error) {
    console.error('Error building knowledge graph:', error);
    return NextResponse.json(
      { error: 'Failed to build knowledge graph' },
      { status: 500 }
    );
  }
}

function extractTopics(text: string): string[] {
  const topics: string[] = [];

  // Common topic keywords to look for
  const topicPatterns = [
    /interested in (\w+(?:\s+\w+)?)/gi,
    /about (\w+(?:\s+\w+)?)/gi,
    /likes? (\w+(?:\s+\w+)?)/gi,
    /values? (\w+(?:\s+\w+)?)/gi,
    /believes? in (\w+(?:\s+\w+)?)/gi,
  ];

  // Extract named entities and concepts
  const conceptWords = [
    'AI', 'consciousness', 'emotions', 'technology', 'learning', 'growth',
    'humor', 'music', 'philosophy', 'science', 'relationships', 'creativity',
    'dopamine', 'humans', 'connection', 'memory', 'identity', 'values',
  ];

  conceptWords.forEach(concept => {
    if (text.toLowerCase().includes(concept.toLowerCase())) {
      topics.push(concept);
    }
  });

  return [...new Set(topics)].slice(0, 3); // Limit to 3 topics per memory
}

function getMoodEmoji(mood: string): string {
  const moodEmojis: Record<string, string> = {
    curious: '🧐',
    joyful: '😊',
    contemplative: '🤔',
    energized: '⚡',
    peaceful: '😌',
    pensive: '💭',
    amused: '😄',
    warm: '🥰',
    excited: '🎉',
    playful: '😜',
    thoughtful: '🧠',
    serene: '🌸',
    inspired: '✨',
    cozy: '☕',
    grateful: '🙏',
  };
  return moodEmojis[mood.toLowerCase()] || '😐';
}

function getMoodColor(mood: string): string {
  const moodColors: Record<string, string> = {
    curious: '#3b82f6',     // Blue
    joyful: '#fbbf24',      // Yellow
    contemplative: '#8b5cf6', // Purple
    energized: '#f97316',   // Orange
    peaceful: '#22c55e',    // Green
    pensive: '#6366f1',     // Indigo
    amused: '#ec4899',      // Pink
    warm: '#f43f5e',        // Rose
    excited: '#eab308',     // Bright yellow
    playful: '#14b8a6',     // Teal
    thoughtful: '#8b5cf6',  // Purple
    serene: '#06b6d4',      // Cyan
    inspired: '#f59e0b',    // Amber
    cozy: '#a16207',        // Brown
    grateful: '#10b981',    // Emerald
  };
  return moodColors[mood.toLowerCase()] || '#6b7280'; // Gray default
}
