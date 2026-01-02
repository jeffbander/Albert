'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type BuildActivity,
  type ActivityType,
  getActivityIcon,
  getActivityColor,
} from '@/lib/buildActivityParser';

interface BuildActivityFeedProps {
  activities: BuildActivity[];
  maxHeight?: string;
  autoScroll?: boolean;
  onActivityClick?: (activity: BuildActivity) => void;
}

// Simple icon components
const Icons: Record<string, React.FC<{ className?: string }>> = {
  'brain': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  'file-plus': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'file-edit': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  'file-text': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'terminal': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  'search': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  'globe': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'lightbulb': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  'alert-circle': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'check-circle': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'activity': ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
};

function ActivityIcon({ type, className }: { type: ActivityType; className?: string }) {
  const iconName = getActivityIcon(type);
  const Icon = Icons[iconName] || Icons['activity'];
  return <Icon className={className} />;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ActivityItem({
  activity,
  onClick,
  isExpanded,
  onToggleExpand,
}: {
  activity: BuildActivity;
  onClick?: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const colorClass = getActivityColor(activity.type);
  const isRunning = activity.status === 'running';
  const hasDetails = !!activity.details || !!activity.filePath;

  return (
    <div
      className={`
        px-3 py-2 rounded-lg border border-gray-700/50
        ${onClick ? 'cursor-pointer hover:bg-gray-800/50' : ''}
        ${isRunning ? 'bg-gray-800/30 border-purple-500/30' : 'bg-gray-900/50'}
        transition-all duration-200
      `}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 mt-0.5 ${colorClass}`}>
          <ActivityIcon type={activity.type} className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-200 truncate">
              {activity.summary}
            </span>
            {isRunning && (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            )}
            {activity.status === 'error' && (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
            {activity.status === 'complete' && (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500" />
            )}
          </div>

          {/* Timestamp and duration */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">
              {formatTime(activity.timestamp)}
            </span>
            {activity.duration && (
              <span className="text-xs text-gray-600">
                {formatDuration(activity.duration)}
              </span>
            )}
            {hasDetails && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                {isExpanded ? 'Hide' : 'Details'}
              </button>
            )}
          </div>

          {/* Expanded details */}
          {isExpanded && hasDetails && (
            <div className="mt-2 p-2 bg-gray-900 rounded text-xs font-mono">
              {activity.filePath && (
                <div className="text-gray-400 mb-1">
                  <span className="text-gray-500">File: </span>
                  {activity.filePath}
                </div>
              )}
              {activity.details && (
                <pre className="text-gray-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {activity.details}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BuildActivityFeed({
  activities,
  maxHeight = '400px',
  autoScroll = true,
  onActivityClick,
}: BuildActivityFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [userScrolled, setUserScrolled] = useState(false);

  // Auto-scroll to bottom when new activities arrive
  useEffect(() => {
    if (autoScroll && !userScrolled && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [activities, autoScroll, userScrolled]);

  // Detect user scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setUserScrolled(!isAtBottom);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
        No activity yet. Start a build to see real-time updates.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <span className="text-sm font-medium text-gray-300">Activity Feed</span>
        <span className="text-xs text-gray-500">{activities.length} events</span>
      </div>

      {/* Activity list */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 space-y-2"
        style={{ maxHeight }}
        onScroll={handleScroll}
      >
        {activities.map((activity) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            onClick={onActivityClick ? () => onActivityClick(activity) : undefined}
            isExpanded={expandedIds.has(activity.id)}
            onToggleExpand={() => toggleExpanded(activity.id)}
          />
        ))}
      </div>

      {/* Scroll indicator */}
      {userScrolled && (
        <button
          onClick={() => {
            setUserScrolled(false);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-4 right-4 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-full shadow-lg transition-colors"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
