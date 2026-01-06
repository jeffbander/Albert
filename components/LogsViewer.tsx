'use client';

import { useState, useEffect, useCallback } from 'react';

interface LogEntry {
  id: string;
  type: 'self-improvement' | 'build' | 'build-activity' | 'system';
  timestamp: string;
  title: string;
  status?: string;
  details?: Record<string, unknown>;
}

interface LogsSummary {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

interface LogsViewerProps {
  className?: string;
  defaultType?: string;
  maxHeight?: string;
}

export default function LogsViewer({
  className = '',
  defaultType = 'all',
  maxHeight = '500px',
}: LogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<LogsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState(defaultType);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [limit, setLimit] = useState(50);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedType !== 'all') params.set('type', selectedType);
      params.set('limit', String(limit));

      const response = await fetch(`/api/logs?${params}`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.logs);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedType, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'self-improvement':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'build':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
      case 'build-activity':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
      case 'complete':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'running':
      case 'building':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'self-improvement':
        return '🔧';
      case 'build':
        return '🏗️';
      case 'build-activity':
        return '📋';
      default:
        return '📄';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleClearLogs = async (type: string) => {
    if (!confirm(`Clear all ${type} logs?`)) return;

    try {
      const response = await fetch(`/api/logs?type=${type}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        fetchLogs();
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  return (
    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <h3 className="font-semibold text-white">System Logs</h3>
          {summary && (
            <span className="text-xs text-gray-400">
              {summary.total} total
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
          >
            <option value="all">All Logs</option>
            <option value="self-improvement">Self-Improvement</option>
            <option value="build">Builds</option>
            <option value="build-activity">Build Activity</option>
          </select>
          <button
            onClick={fetchLogs}
            className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="px-4 py-2 border-b border-gray-700 flex gap-4 text-xs">
          <span className="text-green-400">
            ✓ {summary.byStatus.completed || 0} completed
          </span>
          <span className="text-red-400">
            ✗ {summary.byStatus.failed || 0} failed
          </span>
          <span className="text-yellow-400">
            ⋯ {summary.byStatus.running || 0} running
          </span>
        </div>
      )}

      <div className="flex" style={{ maxHeight }}>
        {/* Log List */}
        <div className="flex-1 overflow-y-auto border-r border-gray-700">
          {loading ? (
            <div className="p-4 text-gray-400">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-4 text-gray-500">No logs found</div>
          ) : (
            <div className="divide-y divide-gray-700">
              {logs.map((log) => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left p-3 hover:bg-gray-700/50 transition ${
                    selectedLog?.id === log.id ? 'bg-purple-600/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0">{getTypeIcon(log.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${getTypeColor(log.type)}`}>
                          {log.type}
                        </span>
                        {log.status && (
                          <span className={`text-xs ${getStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-200 line-clamp-2">
                        {log.title}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatTime(log.timestamp)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Load More */}
          {logs.length >= limit && (
            <button
              onClick={() => setLimit(prev => prev + 50)}
              className="w-full p-2 text-sm text-purple-400 hover:bg-gray-700/50 transition"
            >
              Load more...
            </button>
          )}
        </div>

        {/* Log Details */}
        <div className="w-80 flex-shrink-0 overflow-y-auto bg-gray-900/50">
          {selectedLog ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-1 rounded border ${getTypeColor(selectedLog.type)}`}>
                  {selectedLog.type}
                </span>
                <span className={`text-sm ${getStatusColor(selectedLog.status)}`}>
                  {selectedLog.status}
                </span>
              </div>

              <h4 className="text-white font-medium mb-2">{selectedLog.title}</h4>

              <div className="text-xs text-gray-400 mb-4">
                {formatTime(selectedLog.timestamp)}
              </div>

              <div className="text-xs text-gray-400 mb-2">ID: {selectedLog.id}</div>

              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-gray-300">Details</h5>
                  <div className="bg-gray-800 rounded p-2 text-xs font-mono space-y-1">
                    {Object.entries(selectedLog.details).map(([key, value]) => {
                      if (value === undefined || value === null) return null;
                      return (
                        <div key={key} className="flex gap-2">
                          <span className="text-purple-400">{key}:</span>
                          <span className="text-gray-300 break-all">
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              {selectedLog.type === 'self-improvement' && (
                <div className="mt-4">
                  <button
                    onClick={() => handleClearLogs('self-improvement')}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Clear self-improvement logs
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-gray-500 text-sm">
              Select a log entry to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
