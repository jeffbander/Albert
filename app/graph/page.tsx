'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import PasscodeGate from '@/components/PasscodeGate';

interface GraphNode {
  id: string;
  label: string;
  type: 'user' | 'echo' | 'topic' | 'memory' | 'milestone' | 'interest' | 'opinion' | 'pattern' | 'shared_moment' | 'quirk' | 'mood' | 'reflection' | 'favorite_topic';
  size: number;
  color: string;
  metadata?: Record<string, unknown>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  strength: number;
}

interface RecentActivity {
  type: 'memory' | 'milestone' | 'reflection' | 'mood' | 'quirk' | 'interest' | 'opinion' | 'moment';
  content: string;
  timestamp: string;
}

interface GraphData {
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

export default function KnowledgeGraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetchGraphData();
  }, []);

  const fetchGraphData = async () => {
    try {
      const response = await fetch('/api/graph');
      if (!response.ok) throw new Error('Failed to fetch graph data');
      const graphData: GraphData = await response.json();

      // Initialize node positions BEFORE setting state
      const centerX = 400;
      const centerY = 300;
      graphData.nodes.forEach((node, i) => {
        if (node.id === 'echo') {
          node.x = centerX;
          node.y = centerY;
        } else if (node.id === 'user') {
          node.x = centerX + 150;
          node.y = centerY;
        } else {
          const angle = (i / graphData.nodes.length) * Math.PI * 2;
          const radius = 150 + Math.random() * 150;
          node.x = centerX + Math.cos(angle) * radius;
          node.y = centerY + Math.sin(angle) * radius;
        }
        node.vx = 0;
        node.vy = 0;
      });

      // Set ref BEFORE state so draw() has the positioned nodes
      nodesRef.current = graphData.nodes;
      setData(graphData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const simulate = useCallback(() => {
    if (!data) return;

    const nodes = nodesRef.current;
    const edges = data.edges;
    const centerX = 400;
    const centerY = 300;

    // Apply forces
    nodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;

      // Center gravity
      const dx = centerX - node.x;
      const dy = centerY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        node.vx! += (dx / dist) * 0.1;
        node.vy! += (dy / dist) * 0.1;
      }

      // Repulsion from other nodes
      nodes.forEach(other => {
        if (node.id === other.id || other.x === undefined || other.y === undefined) return;
        const odx = node.x! - other.x;
        const ody = node.y! - other.y;
        const odist = Math.sqrt(odx * odx + ody * ody);
        if (odist > 0 && odist < 100) {
          const force = (100 - odist) / odist * 0.5;
          node.vx! += (odx / odist) * force;
          node.vy! += (ody / odist) * force;
        }
      });
    });

    // Apply edge forces (attraction)
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (!source || !target || source.x === undefined || target.x === undefined) return;

      const dx = target.x - source.x!;
      const dy = target.y! - source.y!;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const targetDist = 120;

      if (dist > 0) {
        const force = (dist - targetDist) * 0.01 * edge.strength;
        source.vx! += (dx / dist) * force;
        source.vy! += (dy / dist) * force;
        target.vx! -= (dx / dist) * force;
        target.vy! -= (dy / dist) * force;
      }
    });

    // Update positions with velocity
    nodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;
      node.vx! *= 0.9; // Damping
      node.vy! *= 0.9;
      node.x += node.vx!;
      node.y += node.vy!;

      // Keep in bounds
      node.x = Math.max(50, Math.min(750, node.x));
      node.y = Math.max(50, Math.min(550, node.y));
    });
  }, [data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, 800, 600);

    // Debug: Draw a test circle to verify canvas works
    ctx.beginPath();
    ctx.arc(100, 100, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'red';
    ctx.fill();

    const nodes = nodesRef.current;
    const edges = data.edges;

    // Debug: Log node count and positions on every 60th frame
    if (Math.random() < 0.02) {
      console.log('Nodes:', nodes.length, 'First node:', nodes[0]?.id, 'x:', nodes[0]?.x, 'y:', nodes[0]?.y);
    }

    // Filter nodes based on selection
    const visibleNodes = filter === 'all'
      ? nodes
      : nodes.filter(n => n.type === filter || n.id === 'echo' || n.id === 'user');

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Draw edges
    edges.forEach(edge => {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return;

      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (!source || !target || source.x === undefined || target.x === undefined) return;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y!);
      ctx.lineTo(target.x, target.y!);
      ctx.strokeStyle = `rgba(100, 100, 100, ${0.2 + edge.strength * 0.3})`;
      ctx.lineWidth = 1 + edge.strength * 2;
      ctx.stroke();
    });

    // Draw nodes
    visibleNodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;

      // Glow for selected
      if (selectedNode?.id === node.id) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size + 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = node.type === 'echo' || node.type === 'user' ? 'bold 12px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const label = node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label;
      ctx.fillText(label, node.x, node.y + node.size + 12);
    });

    simulate();
    animationRef.current = requestAnimationFrame(draw);
  }, [data, filter, selectedNode, simulate]);

  useEffect(() => {
    if (data) {
      draw();
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [data, draw]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = nodesRef.current.find(node => {
      if (node.x === undefined || node.y === undefined) return false;
      const dx = x - node.x;
      const dy = y - node.y;
      return Math.sqrt(dx * dx + dy * dy) < node.size;
    });

    setSelectedNode(clicked || null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading knowledge graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">Error: {error}</div>
      </div>
    );
  }

  return (
    <PasscodeGate>
      <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-purple-400">Albert&apos;s Knowledge Graph</h1>
          <p className="text-gray-400 mt-1">Visualizing memories, interests, and growth</p>
        </div>
        <Link href="/" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition">
          ← Back to Chat
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Stats Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Quick Stats */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">Stats</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Memories</span>
                <span className="text-white font-medium">{data?.stats.totalMemories}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Conversations</span>
                <span className="text-white font-medium">{data?.stats.totalConversations}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time Together</span>
                <span className="text-white font-medium">{data?.stats.totalMinutes} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Relationship</span>
                <span className="text-green-400 font-medium capitalize">{data?.stats.relationshipStage}</span>
              </div>
              {data?.stats.currentMood && data.stats.currentMood !== 'neutral' && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Mood</span>
                  <span className="text-purple-400 font-medium capitalize">{data.stats.currentMood}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Quirks</span>
                <span className="text-amber-400 font-medium">{data?.stats.quirksCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Shared Moments</span>
                <span className="text-pink-400 font-medium">{data?.stats.sharedMomentsCount || 0}</span>
              </div>
            </div>
          </div>

          {/* Personality Traits */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">Personality</h2>
            <div className="space-y-3">
              {[
                { label: 'Warmth', value: data?.selfModel.warmth || 0, color: 'bg-red-500' },
                { label: 'Playfulness', value: data?.selfModel.playfulness || 0, color: 'bg-yellow-500' },
                { label: 'Curiosity', value: data?.selfModel.curiosity || 0, color: 'bg-blue-500' },
                { label: 'Depth', value: data?.selfModel.depth || 0, color: 'bg-purple-500' },
                { label: 'Supportiveness', value: data?.selfModel.supportiveness || 0, color: 'bg-green-500' },
              ].map(trait => (
                <div key={trait.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{trait.label}</span>
                    <span className="text-white">{Math.round(trait.value * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${trait.color} rounded-full transition-all`}
                      style={{ width: `${trait.value * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">Filter</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'All', color: 'bg-gray-600' },
                { value: 'memory', label: 'Memories', color: 'bg-blue-600' },
                { value: 'interest', label: 'Interests', color: 'bg-pink-600' },
                { value: 'opinion', label: 'Opinions', color: 'bg-cyan-600' },
                { value: 'milestone', label: 'Milestones', color: 'bg-emerald-600' },
                { value: 'pattern', label: 'Patterns', color: 'bg-indigo-600' },
                { value: 'shared_moment', label: 'Moments', color: 'bg-pink-400' },
                { value: 'quirk', label: 'Quirks', color: 'bg-amber-500' },
                { value: 'mood', label: 'Mood', color: 'bg-blue-400' },
                { value: 'reflection', label: 'Reflections', color: 'bg-purple-400' },
                { value: 'favorite_topic', label: 'Favorites', color: 'bg-red-500' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1 rounded-full text-xs transition ${
                    filter === f.value ? f.color : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Top Interests */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">Top Interests</h2>
            <div className="space-y-2">
              {data?.stats.topInterests.map((interest, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pink-500" />
                  <span className="text-sm text-gray-300">{interest}</span>
                </div>
              ))}
              {(!data?.stats.topInterests || data.stats.topInterests.length === 0) && (
                <p className="text-gray-500 text-sm">No interests yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="lg:col-span-2 bg-gray-800 rounded-xl p-4">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onClick={handleCanvasClick}
            className="w-full h-auto rounded-lg cursor-pointer"
            style={{ background: 'radial-gradient(circle at center, #1f2937 0%, #111827 100%)' }}
          />

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span>Albert</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>User</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Memory</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Topic</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-pink-500" />
              <span>Interest</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-cyan-500" />
              <span>Opinion</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span>Milestone</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-pink-400" />
              <span>Moment</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <span>Quirk</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-violet-400" />
              <span>Reflection</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>Favorite</span>
            </div>
          </div>
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Selected Node Details */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">
              {selectedNode ? 'Selected Node' : 'Click a node'}
            </h2>
            {selectedNode ? (
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-gray-400 uppercase">{selectedNode.type}</span>
                  <p className="text-white font-medium">{selectedNode.label}</p>
                </div>
                {selectedNode.metadata && (
                  <div className="text-sm text-gray-300 space-y-1">
                    {Object.entries(selectedNode.metadata).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-gray-500">{key}: </span>
                        <span>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Click on any node in the graph to see details</p>
            )}
          </div>

          {/* Recent Milestones */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">Recent Milestones</h2>
            <div className="space-y-2">
              {data?.stats.recentMilestones.map((milestone, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5" />
                  <span className="text-sm text-gray-300">{milestone}</span>
                </div>
              ))}
              {(!data?.stats.recentMilestones || data.stats.recentMilestones.length === 0) && (
                <p className="text-gray-500 text-sm">No milestones yet</p>
              )}
            </div>
          </div>

          {/* Growth Narrative */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">Growth Story</h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              {data?.selfModel.growthNarrative || 'Albert is just beginning to develop their story...'}
            </p>
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-purple-300">Recent Activity</h2>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data?.recentActivity && data.recentActivity.length > 0 ? (
                data.recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-lg">
                      {activity.type === 'memory' && '🧠'}
                      {activity.type === 'milestone' && '🏆'}
                      {activity.type === 'reflection' && '💭'}
                      {activity.type === 'mood' && '😊'}
                      {activity.type === 'moment' && '✨'}
                      {activity.type === 'quirk' && '🎭'}
                      {activity.type === 'interest' && '💡'}
                      {activity.type === 'opinion' && '🗣️'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 truncate">{activity.content}</p>
                      <p className="text-gray-500 text-xs">
                        {new Date(activity.timestamp).toLocaleDateString()} {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No recent activity. Have a conversation to see Albert learn!</p>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </PasscodeGate>
  );
}
