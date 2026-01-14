'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Panel from './Panel';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState } from '@/types/dashboard';
import type { BuildProgressEvent, BuildStatus, BuildActivity } from '@/types/build';

interface BuildPanelProps {
  panel: PanelState;
}

export default function BuildPanel({ panel }: BuildPanelProps) {
  const { updatePanelData } = useDashboard();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectId = panel.data?.projectId as string;
  const projectDescription = panel.data?.description as string;
  const currentPhase = (panel.data?.phase as BuildStatus) || 'queued';
  const progress = panel.data?.progress as number || 0;
  const logs = (panel.data?.logs as string[]) || [];
  const activities = (panel.data?.activities as BuildActivity[]) || [];
  const localPort = panel.data?.localPort as number;
  const deployUrl = panel.data?.deployUrl as string;

  // Subscribe to SSE for project updates
  useEffect(() => {
    if (!projectId) return;

    const eventSource = new EventSource(`/api/build/${projectId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        // Handle activity events
        if (data.type === 'activity' && data.activity) {
          const newActivities = [...activities];
          const existing = newActivities.findIndex(a => a.id === data.activity.id);
          if (existing >= 0) {
            newActivities[existing] = data.activity;
          } else {
            newActivities.push(data.activity);
          }
          updatePanelData(panel.id, { activities: newActivities });
        }

        const progressEvent = data as BuildProgressEvent;
        updatePanelData(panel.id, {
          phase: progressEvent.phase,
          progress: progressEvent.progress,
          logs: [...logs, progressEvent.message],
        });

        // Update with completion data
        if (progressEvent.phase === 'complete' || progressEvent.phase === 'failed') {
          fetchProjectStatus();
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [projectId, panel.id, activities, logs, updatePanelData]);

  // Fetch project status
  const fetchProjectStatus = useCallback(async () => {
    if (!projectId) return;

    try {
      const response = await fetch(`/api/build/${projectId}/status`);
      const data = await response.json();
      if (data.success && data.project) {
        updatePanelData(panel.id, {
          phase: data.project.status,
          localPort: data.project.localPort,
          deployUrl: data.project.deployUrl,
          description: data.project.description,
        });
      }
    } catch (err) {
      console.error('Failed to fetch project status:', err);
    }
  }, [projectId, panel.id, updatePanelData]);

  // Fetch on mount if we have a project ID
  useEffect(() => {
    if (projectId) {
      fetchProjectStatus();
    }
  }, [projectId, fetchProjectStatus]);

  // Action handlers
  const handleCancel = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      await fetch(`/api/build/${projectId}/cancel`, { method: 'POST' });
      fetchProjectStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/build/${projectId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.newProjectId) {
        updatePanelData(panel.id, {
          projectId: data.newProjectId,
          phase: 'planning',
          progress: 0,
          logs: [],
          activities: [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/build/${projectId}/deploy`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        updatePanelData(panel.id, { deployUrl: data.url });
      } else {
        setError(data.error || 'Deploy failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setIsLoading(false);
    }
  };

  const getPhaseLabel = (phase: BuildStatus) => {
    const labels: Record<BuildStatus, string> = {
      queued: 'Queued',
      planning: 'Planning',
      building: 'Building',
      testing: 'Testing',
      deploying: 'Deploying',
      complete: 'Complete',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return labels[phase] || phase;
  };

  const getPhaseColor = (phase: BuildStatus) => {
    switch (phase) {
      case 'complete':
        return 'text-green-400';
      case 'failed':
      case 'cancelled':
        return 'text-red-400';
      case 'building':
      case 'testing':
        return 'text-yellow-400';
      case 'planning':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const isActive = ['planning', 'building', 'testing', 'deploying'].includes(currentPhase);

  return (
    <Panel
      panel={panel}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      }
      statusIndicator={
        isActive ? 'loading' : currentPhase === 'complete' ? 'success' : currentPhase === 'failed' ? 'error' : null
      }
    >
      <div className="flex flex-col h-full">
        {/* Project info */}
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-200 truncate">
            {projectDescription || 'New Project'}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs ${getPhaseColor(currentPhase)}`}>
              {getPhaseLabel(currentPhase)}
            </span>
            {progress > 0 && progress < 100 && (
              <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isActive && (
          <div className="px-4 py-2 border-b border-gray-700">
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        {projectId && (
          <div className="px-4 py-2 border-b border-gray-700 flex gap-2">
            {isActive && (
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-xs transition"
              >
                Cancel
              </button>
            )}
            {currentPhase === 'failed' && (
              <button
                onClick={handleRetry}
                disabled={isLoading}
                className="px-3 py-1 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded text-xs transition"
              >
                Retry
              </button>
            )}
            {currentPhase === 'complete' && !deployUrl && (
              <button
                onClick={handleDeploy}
                disabled={isLoading}
                className="px-3 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-xs transition"
              >
                Deploy
              </button>
            )}
            {localPort && (
              <a
                href={`http://localhost:${localPort}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded text-xs transition"
              >
                Open :${localPort}
              </a>
            )}
            {deployUrl && (
              <a
                href={deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded text-xs transition"
              >
                View Deployed
              </a>
            )}
          </div>
        )}

        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Activity/Logs area */}
        <div className="flex-1 overflow-auto">
          {activities.length > 0 ? (
            <div className="divide-y divide-gray-700/50">
              {activities.slice(-20).map((activity) => (
                <div key={activity.id} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs ${
                        activity.status === 'success'
                          ? 'text-green-400'
                          : activity.status === 'error'
                          ? 'text-red-400'
                          : activity.status === 'in_progress'
                          ? 'text-yellow-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {activity.type}
                    </span>
                    {activity.filePath && (
                      <span className="text-xs text-gray-500 truncate">{activity.filePath}</span>
                    )}
                  </div>
                  {activity.content && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{activity.content}</p>
                  )}
                </div>
              ))}
            </div>
          ) : logs.length > 0 ? (
            <div className="p-4 space-y-1 font-mono text-xs">
              {logs.slice(-30).map((log, i) => (
                <p key={i} className="text-gray-400">{log}</p>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              <p>Waiting for build activity...</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
