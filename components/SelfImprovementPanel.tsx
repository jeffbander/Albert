'use client';

import { useState, useEffect, useRef } from 'react';
import type { BuildActivity } from '@/lib/buildActivityParser';

interface ImprovementLog {
  id: string;
  timestamp: string;
  task: string;
  reason: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  activities?: BuildActivity[];
  cost?: number;
  commitSha?: string;
}

interface SelfImprovementPanelProps {
  className?: string;
}

export default function SelfImprovementPanel({ className = '' }: SelfImprovementPanelProps) {
  const [improvements, setImprovements] = useState<ImprovementLog[]>([]);
  const [activeImprovement, setActiveImprovement] = useState<string | null>(null);
  const [activities, setActivities] = useState<BuildActivity[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch improvement logs
  useEffect(() => {
    fetchImprovements();
    const interval = setInterval(fetchImprovements, 5000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to SSE for active improvement
  useEffect(() => {
    if (!activeImprovement) return;

    const eventSource = new EventSource(`/api/self-improve/${activeImprovement}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'activity':
            setActivities(prev => {
              const existing = prev.findIndex(a => a.id === data.activity.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = data.activity;
                return updated;
              }
              return [...prev, data.activity];
            });
            break;

          case 'message':
            setMessages(prev => [...prev, data.message]);
            break;

          case 'complete':
            fetchImprovements();
            break;

          case 'not_found':
          case 'error':
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeImprovement]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchImprovements = async () => {
    try {
      const response = await fetch('/api/self-improve');
      const data = await response.json();
      if (data.success) {
        setImprovements(data.recentLogs || []);

        // Auto-select first running improvement
        const running = data.recentLogs?.find((l: ImprovementLog) => l.status === 'running');
        if (running && !activeImprovement) {
          setActiveImprovement(running.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch improvements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'failed': return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'running': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'file_write':
        return '📝';
      case 'file_edit':
        return '✏️';
      case 'file_read':
        return '📖';
      case 'bash':
        return '💻';
      case 'search':
        return '🔍';
      default:
        return '⚡';
    }
  };

  if (loading) {
    return (
      <div className={`bg-gray-800/50 rounded-lg p-4 ${className}`}>
        <div className="text-gray-400">Loading self-improvements...</div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔧</span>
          <h3 className="font-semibold text-white">Self-Improvement</h3>
          {improvements.some(i => i.status === 'running') && (
            <span className="animate-pulse text-yellow-400 text-sm">● Running</span>
          )}
        </div>
        <button
          onClick={fetchImprovements}
          className="text-gray-400 hover:text-white transition text-sm"
        >
          Refresh
        </button>
      </div>

      <div className="flex h-[400px]">
        {/* Improvement List */}
        <div className="w-64 border-r border-gray-700 overflow-y-auto">
          {improvements.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">
              No self-improvements yet. Ask Albert to improve himself!
            </div>
          ) : (
            improvements.map(improvement => (
              <button
                key={improvement.id}
                onClick={() => {
                  setActiveImprovement(improvement.id);
                  setActivities(improvement.activities || []);
                  setMessages([]);
                }}
                className={`w-full text-left p-3 border-b border-gray-700 hover:bg-gray-700/50 transition ${
                  activeImprovement === improvement.id ? 'bg-purple-600/20' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-gray-200 line-clamp-2">
                    {improvement.task.slice(0, 60)}...
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${getStatusColor(improvement.status)}`}>
                    {improvement.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(improvement.timestamp).toLocaleString()}
                </div>
                {improvement.commitSha && (
                  <div className="text-xs text-green-400 mt-1">
                    ✓ Committed: {improvement.commitSha.slice(0, 7)}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Detail View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeImprovement ? (
            <>
              {/* Activity Feed */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Live Activity</h4>
                {activities.length === 0 ? (
                  <div className="text-gray-500 text-sm">Waiting for activities...</div>
                ) : (
                  activities.map((activity, i) => (
                    <div
                      key={activity.id || i}
                      className="flex items-start gap-2 text-sm bg-gray-700/50 rounded p-2"
                    >
                      <span className="flex-shrink-0">{getActivityIcon(activity.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-200 font-medium">
                          {activity.type.replace(/_/g, ' ')}
                        </div>
                        {activity.filePath && (
                          <div className="text-gray-400 text-xs truncate">
                            {activity.filePath}
                          </div>
                        )}
                        {activity.details && (
                          <div className="text-gray-400 text-xs line-clamp-2">
                            {activity.details}
                          </div>
                        )}
                      </div>
                      <span className={`text-xs ${activity.status === 'complete' ? 'text-green-400' : 'text-yellow-400'}`}>
                        {activity.status === 'complete' ? '✓' : '⋯'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Messages Stream */}
              {messages.length > 0 && (
                <div className="h-32 border-t border-gray-700 overflow-y-auto bg-gray-900/50">
                  <h4 className="text-xs font-medium text-gray-500 px-3 py-1 sticky top-0 bg-gray-900/90">
                    Claude Code Output
                  </h4>
                  <div className="px-3 pb-2 space-y-1 font-mono text-xs text-gray-400">
                    {messages.slice(-20).map((msg, i) => (
                      <div key={i} className="whitespace-pre-wrap break-words">
                        {msg.slice(0, 200)}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select an improvement to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
