import { NextResponse } from 'next/server';
import {
  getEchoSelfModel,
  getTimeline,
  getRecentEpisodicMemories,
  getProceduralMemories,
  getLatestGrowthMetrics,
  getConversationCount,
  getTotalInteractionTime,
} from '@/lib/db';
import { getRecentMemories, getEchoMemories } from '@/lib/mem0';

export interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'echo' | 'topic' | 'memory' | 'milestone' | 'interest' | 'opinion' | 'pattern';
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
  };
  selfModel: {
    warmth: number;
    playfulness: number;
    curiosity: number;
    depth: number;
    supportiveness: number;
    growthNarrative: string;
  };
}

export async function GET() {
  try {
    // Fetch all data in parallel
    const [
      userMemories,
      echoMemories,
      selfModel,
      timeline,
      episodicMemories,
      proceduralMemories,
      growthMetrics,
      conversationCount,
      totalSeconds,
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
    ]);

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
    userMemories.forEach((mem, i) => {
      const memId = `mem_${i}`;
      nodes.push({
        id: memId,
        label: mem.memory.length > 50 ? mem.memory.slice(0, 50) + '...' : mem.memory,
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
      const topics = extractTopics(mem.memory);
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
    selfModel.interests.forEach((interest, i) => {
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
    selfModel.opinions.forEach((opinion, i) => {
      const opinionId = `opinion_${i}`;
      nodes.push({
        id: opinionId,
        label: `${opinion.topic}: ${opinion.stance.slice(0, 30)}...`,
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
    timeline.forEach((milestone, i) => {
      const msId = `milestone_${i}`;
      nodes.push({
        id: msId,
        label: milestone.title,
        type: 'milestone',
        size: 12 + milestone.significance * 12,
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
        strength: milestone.significance,
      });
    });

    // Add procedural patterns
    proceduralMemories.slice(0, 10).forEach((pattern, i) => {
      const patternId = `pattern_${i}`;
      nodes.push({
        id: patternId,
        label: pattern.pattern.slice(0, 40) + '...',
        type: 'pattern',
        size: 10 + pattern.effectiveness * 10,
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
        strength: pattern.effectiveness,
      });
    });

    // Build response
    const graphData: GraphData = {
      nodes,
      edges,
      stats: {
        totalMemories: userMemories.length + echoMemories.length,
        totalConversations: conversationCount,
        totalMinutes: Math.round(totalSeconds / 60),
        relationshipStage: growthMetrics?.relationship_stage || 'new',
        topInterests: selfModel.interests
          .sort((a, b) => b.strength - a.strength)
          .slice(0, 5)
          .map(i => i.topic),
        recentMilestones: timeline.slice(0, 3).map(m => m.title),
      },
      selfModel: {
        warmth: selfModel.personality_warmth,
        playfulness: selfModel.personality_playfulness,
        curiosity: selfModel.personality_curiosity,
        depth: selfModel.personality_depth,
        supportiveness: selfModel.personality_supportiveness,
        growthNarrative: selfModel.growth_narrative,
      },
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
