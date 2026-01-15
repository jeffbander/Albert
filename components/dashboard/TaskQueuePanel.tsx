'use client';

import React, { useState } from 'react';
import Panel from './Panel';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState, TaskItem } from '@/types/dashboard';

interface TaskQueuePanelProps {
  panel: PanelState;
}

export default function TaskQueuePanel({ panel }: TaskQueuePanelProps) {
  const { state, openPanel } = useDashboard();
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  const tasks = state.tasks.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'running') return task.status === 'running' || task.status === 'pending';
    return task.status === filter;
  });

  const runningCount = state.tasks.filter(t => t.status === 'running' || t.status === 'pending').length;
  const completedCount = state.tasks.filter(t => t.status === 'completed').length;
  const failedCount = state.tasks.filter(t => t.status === 'failed').length;

  const getTaskIcon = (type: TaskItem['type']) => {
    switch (type) {
      case 'research':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        );
      case 'build':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        );
      case 'email':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'browser':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        );
      case 'skill':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
    }
  };

  const getStatusBadge = (status: TaskItem['status']) => {
    switch (status) {
      case 'pending':
        return <span className="text-xs px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">Pending</span>;
      case 'running':
        return (
          <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            Running
          </span>
        );
      case 'completed':
        return <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Completed</span>;
      case 'failed':
        return <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">Failed</span>;
    }
  };

  const handleTaskClick = (task: TaskItem) => {
    // Open the corresponding panel for this task type
    const panelType = task.type === 'skill' ? 'build' : task.type;
    openPanel(panelType, task.metadata);
  };

  return (
    <Panel
      panel={panel}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      }
      statusIndicator={runningCount > 0 ? 'active' : null}
    >
      <div className="flex flex-col h-full">
        {/* Stats bar */}
        <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-3 text-xs">
          <span className="text-blue-400">{runningCount} active</span>
          <span className="text-green-400">{completedCount} completed</span>
          {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
        </div>

        {/* Filter tabs */}
        <div className="px-2 py-2 border-b border-gray-700 flex gap-1">
          {(['all', 'running', 'completed', 'failed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-xs rounded transition ${
                filter === f
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-auto">
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              <div className="text-center">
                <svg className="w-10 h-10 mx-auto mb-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p>No {filter === 'all' ? '' : filter} tasks</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="w-full text-left p-3 hover:bg-gray-800/50 transition"
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${
                      task.status === 'running' ? 'text-blue-400' :
                      task.status === 'completed' ? 'text-green-400' :
                      task.status === 'failed' ? 'text-red-400' :
                      'text-gray-400'
                    }`}>
                      {getTaskIcon(task.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-200 truncate">{task.title}</span>
                        {getStatusBadge(task.status)}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{task.description}</p>

                      {/* Progress bar for running tasks */}
                      {task.status === 'running' && task.progress !== undefined && (
                        <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      )}

                      <p className="text-xs text-gray-600 mt-1">
                        {task.status === 'completed' || task.status === 'failed'
                          ? task.completedAt
                            ? `Finished ${new Date(task.completedAt).toLocaleTimeString()}`
                            : ''
                          : `Started ${new Date(task.startedAt).toLocaleTimeString()}`
                        }
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
