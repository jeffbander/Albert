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
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
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

  // Push changes to GitHub
  const handlePushToGitHub = async () => {
    setPushing(true);
    setPushResult(null);

    try {
      const response = await fetch('/api/self-improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          message: 'Push latest self-improvement changes',
          push: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPushResult({
          success: true,
          message: data.sha ? `Pushed! Commit: ${data.sha.slice(0, 7)}` : 'Pushed to GitHub!',
        });
        // Refresh improvements to show updated commit info
        fetchImprovements();
      } else {
        setPushResult({
          success: false,
          message: data.error || 'Push failed',
        });
      }
    } catch (error) {
      setPushResult({
        success: false,
        message: error instanceof Error ? error.message : 'Push failed',
      });
    } finally {
      setPushing(false);
      // Clear result after 5 seconds
      setTimeout(() => setPushResult(null), 5000);
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
        <div className="flex items-center gap-2">
          {/* Push result indicator */}
          {pushResult && (
            <span className={`text-xs ${pushResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {pushResult.message}
            </span>
          )}

          {/* GitHub Push Button */}
          <button
            onClick={handlePushToGitHub}
            disabled={pushing || improvements.some(i => i.status === 'running')}
            className={`px-2 py-1 text-sm rounded flex items-center gap-1 transition ${
              pushing || improvements.some(i => i.status === 'running')
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            title="Push changes to GitHub"
          >
            {pushing ? (
              <span className="animate-spin">⟳</span>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            )}
            Push
          </button>

          <button
            onClick={fetchImprovements}
            className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition"
          >
            Refresh
          </button>
        </div>
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
