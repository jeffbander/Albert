'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PasscodeGate from '@/components/PasscodeGate';
import type { BuildProject, BuildLogEntry, BuildProgressEvent, ProjectType, DeployTarget } from '@/types/build';

export default function BuilderDashboard() {
  const [projects, setProjects] = useState<BuildProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [logs, setLogs] = useState<BuildLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);

  // New project form state
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('web-app');
  const [newProjectStack, setNewProjectStack] = useState('');
  const [newDeployTarget, setNewDeployTarget] = useState<DeployTarget>('localhost');

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Subscribe to SSE for selected project
  useEffect(() => {
    if (!selectedProject) return;

    const eventSource = new EventSource(`/api/build/${selectedProject}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Skip connection messages
        if (data.type === 'connected') return;
        const progressEvent = data as BuildProgressEvent;

        // Update logs
        setLogs(prev => [...prev, {
          id: crypto.randomUUID(),
          projectId: progressEvent.projectId,
          phase: progressEvent.phase,
          message: progressEvent.message,
          timestamp: new Date(progressEvent.timestamp),
        }]);

        // Refresh projects if status changed
        if (progressEvent.phase === 'complete' || progressEvent.phase === 'failed') {
          fetchProjects();
          setIsBuilding(false);
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [selectedProject]);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/build/projects');
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectLogs = useCallback(async (projectId: string) => {
    try {
      const response = await fetch(`/api/build/${projectId}/status`);
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, []);

  const handleSelectProject = (projectId: string) => {
    setSelectedProject(projectId);
    setLogs([]);
    fetchProjectLogs(projectId);
  };

  const handleStartBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectDescription.trim()) return;

    setIsBuilding(true);
    try {
      const response = await fetch('/api/build/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDescription: newProjectDescription,
          projectType: newProjectType,
          preferredStack: newProjectStack || undefined,
          deployTarget: newDeployTarget,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setNewProjectDescription('');
        setNewProjectStack('');
        setSelectedProject(data.projectId);
        fetchProjects();
      } else {
        alert(`Build failed: ${data.error}`);
        setIsBuilding(false);
      }
    } catch (error) {
      console.error('Failed to start build:', error);
      alert('Failed to start build');
      setIsBuilding(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'building': return 'text-yellow-400';
      case 'planning': return 'text-blue-400';
      case 'testing': return 'text-purple-400';
      case 'deploying': return 'text-cyan-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      complete: 'bg-green-500/20 text-green-400 border-green-500/50',
      failed: 'bg-red-500/20 text-red-400 border-red-500/50',
      building: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      planning: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      testing: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
      deploying: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
      queued: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    };
    return colors[status] || colors.queued;
  };

  const selectedProjectData = projects.find(p => p.id === selectedProject);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading builder...</div>
      </div>
    );
  }

  return (
    <PasscodeGate>
      <div className="min-h-screen bg-gray-900 text-white">
        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-purple-400">Albert Builder</h1>
              <p className="text-gray-400 text-sm">Autonomous project building powered by Claude Code</p>
            </div>
            <Link href="/" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition">
              Back to Chat
            </Link>
          </div>
        </header>

        <div className="flex h-[calc(100vh-73px)]">
          {/* Sidebar - Project List */}
          <aside className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <div className="p-4">
              <h2 className="text-lg font-semibold mb-4">Projects</h2>

              {projects.length === 0 ? (
                <p className="text-gray-500 text-sm">No projects yet. Start your first build!</p>
              ) : (
                <div className="space-y-2">
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      className={`w-full text-left p-3 rounded-lg transition ${
                        selectedProject === project.id
                          ? 'bg-purple-600/30 border border-purple-500'
                          : 'bg-gray-700 hover:bg-gray-600 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate flex-1">
                          {project.description.slice(0, 40)}...
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${getStatusBadge(project.status)}`}>
                          {project.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="bg-gray-600 px-1.5 py-0.5 rounded">{project.projectType}</span>
                        {project.localPort && (
                          <a
                            href={`http://localhost:${project.localPort}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            :${project.localPort}
                          </a>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col">
            {/* New Project Form */}
            <div className="p-6 bg-gray-800/50 border-b border-gray-700">
              <h3 className="text-lg font-semibold mb-4">Start New Build</h3>
              <form onSubmit={handleStartBuild} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Project Description</label>
                  <textarea
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Describe what you want to build... (e.g., 'A todo app with React and local storage')"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    rows={3}
                    disabled={isBuilding}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Project Type</label>
                    <select
                      value={newProjectType}
                      onChange={(e) => setNewProjectType(e.target.value as ProjectType)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                      disabled={isBuilding}
                    >
                      <option value="web-app">Web App</option>
                      <option value="api">API</option>
                      <option value="cli">CLI Tool</option>
                      <option value="library">Library</option>
                      <option value="full-stack">Full Stack</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Tech Stack (optional)</label>
                    <input
                      type="text"
                      value={newProjectStack}
                      onChange={(e) => setNewProjectStack(e.target.value)}
                      placeholder="e.g., React, TypeScript"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      disabled={isBuilding}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Deploy Target</label>
                    <select
                      value={newDeployTarget}
                      onChange={(e) => setNewDeployTarget(e.target.value as DeployTarget)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                      disabled={isBuilding}
                    >
                      <option value="localhost">Localhost</option>
                      <option value="vercel">Vercel</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isBuilding || !newProjectDescription.trim()}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition font-medium"
                >
                  {isBuilding ? 'Building...' : 'Start Build'}
                </button>
              </form>
            </div>

            {/* Build Logs */}
            <div className="flex-1 p-6 overflow-y-auto">
              {selectedProject ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">
                      Build Logs
                      {selectedProjectData && (
                        <span className={`ml-2 ${getStatusColor(selectedProjectData.status)}`}>
                          ({selectedProjectData.status})
                        </span>
                      )}
                    </h3>
                    {selectedProjectData?.localPort && (
                      <a
                        href={`http://localhost:${selectedProjectData.localPort}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition text-sm"
                      >
                        Open Preview (:{selectedProjectData.localPort})
                      </a>
                    )}
                  </div>

                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 font-mono text-sm space-y-2 max-h-[500px] overflow-y-auto">
                    {logs.length === 0 ? (
                      <p className="text-gray-500">Waiting for logs...</p>
                    ) : (
                      logs.map((log, i) => (
                        <div key={log.id || i} className="flex items-start gap-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusBadge(log.phase)}`}>
                            {log.phase}
                          </span>
                          <span className="text-gray-300 flex-1">{log.message}</span>
                          <span className="text-gray-500 text-xs">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>Select a project to view logs, or start a new build above.</p>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </PasscodeGate>
  );
}
