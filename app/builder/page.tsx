'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import PasscodeGate from '@/components/PasscodeGate';
import BuildProgressBar from '@/components/BuildProgressBar';
import BuildPhaseFlow from '@/components/BuildPhaseFlow';
import BuildPreview from '@/components/BuildPreview';
import BuildActivityFeed from '@/components/BuildActivityFeed';
import BuildFileTree, { type FileNode } from '@/components/BuildFileTree';
import FileContentViewer from '@/components/FileContentViewer';
import SelfImprovementPanel from '@/components/SelfImprovementPanel';
import LogsViewer from '@/components/LogsViewer';
import type { BuildActivity } from '@/lib/buildActivityParser';
import type { BuildProject, BuildLogEntry, BuildProgressEvent, ProjectType, DeployTarget, BuildStatus } from '@/types/build';

export default function BuilderDashboard() {
  const [projects, setProjects] = useState<BuildProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [logs, setLogs] = useState<BuildLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);

  // Progress tracking
  const [currentProgress, setCurrentProgress] = useState<number | undefined>(undefined);
  const [currentPhase, setCurrentPhase] = useState<BuildStatus>('queued');

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');

  // Fine control - Activity Feed
  const [activities, setActivities] = useState<BuildActivity[]>([]);

  // Fine control - File Explorer
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Panel visibility
  const [showActivityFeed, setShowActivityFeed] = useState(true);
  const [showFileExplorer, setShowFileExplorer] = useState(true);
  const [showSelfImprovement, setShowSelfImprovement] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

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

        // Handle activity events
        if (data.type === 'activity' && data.activity) {
          setActivities(prev => {
            const existing = prev.findIndex(a => a.id === data.activity.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = data.activity;
              return updated;
            }
            return [...prev, data.activity];
          });
          // Refresh file tree on file changes
          if (['file_write', 'file_edit'].includes(data.activity.type)) {
            fetchFileTree(selectedProject);
          }
        }

        const progressEvent = data as BuildProgressEvent;

        // Update progress state
        setCurrentProgress(progressEvent.progress);
        setCurrentPhase(progressEvent.phase);

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
          fetchFileTree(selectedProject);
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
        // Set initial phase from project
        if (data.project) {
          setCurrentPhase(data.project.status);
        }
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, []);

  const fetchFileTree = useCallback(async (projectId: string) => {
    try {
      const response = await fetch(`/api/build/${projectId}/files`);
      const data = await response.json();
      if (data.success) {
        setFileTree(data.tree);
      }
    } catch (error) {
      console.error('Failed to fetch file tree:', error);
    }
  }, []);

  const fetchFileContent = useCallback(async (projectId: string, filePath: string) => {
    setFileLoading(true);
    try {
      const response = await fetch(`/api/build/${projectId}/files/${encodeURIComponent(filePath)}`);
      const data = await response.json();
      if (data.success) {
        setFileContent(data.content);
        setSelectedFile(filePath);
      }
    } catch (error) {
      console.error('Failed to fetch file content:', error);
    } finally {
      setFileLoading(false);
    }
  }, []);

  const handleSelectProject = (projectId: string) => {
    setSelectedProject(projectId);
    setLogs([]);
    setActivities([]);
    setFileTree(null);
    setFileContent(null);
    setSelectedFile(null);
    setCurrentProgress(undefined);
    fetchProjectLogs(projectId);
    fetchFileTree(projectId);
  };

  const handleFileSelect = (node: FileNode) => {
    if (!selectedProject || node.isDirectory) return;
    fetchFileContent(selectedProject, node.relativePath);
  };

  const handleStartBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectDescription.trim()) return;

    setIsBuilding(true);
    setCurrentProgress(0);
    setCurrentPhase('planning');

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

  // Action handlers
  const handleCancel = async () => {
    if (!selectedProject) return;
    setActionLoading('cancel');
    try {
      await fetch(`/api/build/${selectedProject}/cancel`, { method: 'POST' });
      fetchProjects();
    } catch (error) {
      console.error('Failed to cancel:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async () => {
    if (!selectedProject) return;
    setActionLoading('retry');
    try {
      const response = await fetch(`/api/build/${selectedProject}/retry`, { method: 'POST' });
      const data = await response.json();
      if (data.success && data.newProjectId) {
        setSelectedProject(data.newProjectId);
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to retry:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeploy = async () => {
    if (!selectedProject) return;
    setActionLoading('deploy');
    try {
      const response = await fetch(`/api/build/${selectedProject}/deploy`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        alert(`Deployed! URL: ${data.url}`);
        fetchProjects();
      } else {
        alert(`Deploy failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to deploy:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGitHubPush = async () => {
    if (!selectedProject || !githubRepo.trim()) return;
    setActionLoading('github');
    try {
      const response = await fetch(`/api/build/${selectedProject}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: githubRepo }),
      });
      const data = await response.json();
      if (data.success) {
        alert(`Pushed to GitHub! ${data.repoUrl}`);
        setGithubModalOpen(false);
        setGithubRepo('');
      } else {
        alert(`Push failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to push:', error);
    } finally {
      setActionLoading(null);
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
  const isActivePhase = ['planning', 'building', 'testing', 'deploying'].includes(currentPhase);
  const canCancel = selectedProjectData && isActivePhase;
  const canRetry = selectedProjectData?.status === 'failed';
  const canDeploy = selectedProjectData?.status === 'complete';
  const canGitHub = selectedProjectData?.status === 'complete';

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
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSelfImprovement(!showSelfImprovement)}
                className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
                  showSelfImprovement
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
              >
                🔧 Self-Improvement
              </button>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
                  showLogs
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
              >
                📊 Logs
              </button>
              <Link href="/" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition">
                Back to Chat
              </Link>
            </div>
          </div>
        </header>

        <div className="flex h-[calc(100vh-73px)]">
          {/* Sidebar - Project List */}
          <aside className="w-64 bg-gray-800 border-r border-gray-700 overflow-y-auto flex-shrink-0">
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-300">Projects</h2>
                <span className="text-xs text-gray-500">{projects.length}</span>
              </div>

              {projects.length === 0 ? (
                <p className="text-gray-500 text-xs">No projects yet</p>
              ) : (
                <div className="space-y-1">
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      className={`w-full text-left p-2 rounded-lg transition ${
                        selectedProject === project.id
                          ? 'bg-purple-600/30 border border-purple-500'
                          : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate flex-1 text-gray-200">
                          {project.description.slice(0, 25)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStatusBadge(project.status)}`}>
                          {project.status}
                        </span>
                        <span className="text-[10px] text-gray-500">{project.projectType}</span>
                        {project.localPort && (
                          <span className="text-[10px] text-blue-400">:{project.localPort}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0">
            {/* New Project Form */}
            <div className="p-4 bg-gray-800/50 border-b border-gray-700">
              <h3 className="text-lg font-semibold mb-3">Start New Build</h3>
              <form onSubmit={handleStartBuild} className="space-y-3">
                <div>
                  <textarea
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Describe what you want to build..."
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    rows={2}
                    disabled={isBuilding}
                  />
                </div>

                <div className="flex gap-3">
                  <select
                    value={newProjectType}
                    onChange={(e) => setNewProjectType(e.target.value as ProjectType)}
                    className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    disabled={isBuilding}
                  >
                    <option value="web-app">Web App</option>
                    <option value="api">API</option>
                    <option value="cli">CLI</option>
                    <option value="library">Library</option>
                    <option value="full-stack">Full Stack</option>
                  </select>

                  <input
                    type="text"
                    value={newProjectStack}
                    onChange={(e) => setNewProjectStack(e.target.value)}
                    placeholder="Tech stack (optional)"
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    disabled={isBuilding}
                  />

                  <select
                    value={newDeployTarget}
                    onChange={(e) => setNewDeployTarget(e.target.value as DeployTarget)}
                    className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    disabled={isBuilding}
                  >
                    <option value="localhost">Localhost</option>
                    <option value="vercel">Vercel</option>
                  </select>

                  <button
                    type="submit"
                    disabled={isBuilding || !newProjectDescription.trim()}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition font-medium text-sm"
                  >
                    {isBuilding ? 'Building...' : 'Build'}
                  </button>
                </div>
              </form>
            </div>

            {/* Self-Improvement Panel (Collapsible) */}
            {showSelfImprovement && (
              <div className="border-b border-gray-700">
                <SelfImprovementPanel className="max-h-[450px]" />
              </div>
            )}

            {/* Logs Viewer Panel (Collapsible) */}
            {showLogs && (
              <div className="border-b border-gray-700">
                <LogsViewer maxHeight="400px" />
              </div>
            )}

            {/* Build Info & Logs */}
            <div className="flex-1 p-4 overflow-y-auto">
              {selectedProject ? (
                <div className="space-y-4">
                  {/* Phase Flow */}
                  <BuildPhaseFlow currentPhase={currentPhase} />

                  {/* Progress Bar */}
                  <BuildProgressBar
                    progress={currentProgress}
                    phase={currentPhase}
                    isActive={isActivePhase}
                  />

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    {canCancel && (
                      <button
                        onClick={handleCancel}
                        disabled={actionLoading === 'cancel'}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-lg transition text-sm"
                      >
                        {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Build'}
                      </button>
                    )}
                    {canRetry && (
                      <button
                        onClick={handleRetry}
                        disabled={actionLoading === 'retry'}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded-lg transition text-sm"
                      >
                        {actionLoading === 'retry' ? 'Retrying...' : 'Retry Build'}
                      </button>
                    )}
                    {canDeploy && (
                      <button
                        onClick={handleDeploy}
                        disabled={actionLoading === 'deploy'}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded-lg transition text-sm"
                      >
                        {actionLoading === 'deploy' ? 'Deploying...' : 'Deploy to Vercel'}
                      </button>
                    )}
                    {canGitHub && (
                      <button
                        onClick={() => setGithubModalOpen(true)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition text-sm"
                      >
                        Push to GitHub
                      </button>
                    )}
                  </div>

                  {/* Build Prompt (Collapsible) */}
                  {selectedProjectData?.buildPrompt && (
                    <details className="group">
                      <summary className="cursor-pointer text-sm text-purple-400 hover:text-purple-300 transition flex items-center gap-2">
                        <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        View Build Prompt Sent to Claude Code
                      </summary>
                      <div className="mt-2 bg-gray-800 rounded-lg border border-purple-500/30 p-4 font-mono text-xs text-gray-300 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                        {selectedProjectData.buildPrompt}
                      </div>
                    </details>
                  )}

                  {/* Logs */}
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      Build Logs
                      <span className={`ml-2 ${getStatusColor(currentPhase)}`}>
                        ({currentPhase})
                      </span>
                    </h3>
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 font-mono text-sm space-y-2 max-h-[300px] overflow-y-auto">
                      {logs.length === 0 ? (
                        <p className="text-gray-500">Waiting for logs...</p>
                      ) : (
                        logs.map((log, i) => (
                          <div key={log.id || i} className="flex items-start gap-3">
                            <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getStatusBadge(log.phase)}`}>
                              {log.phase}
                            </span>
                            <span className="text-gray-300 flex-1 break-words">{log.message}</span>
                            <span className="text-gray-500 text-xs flex-shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>Select a project to view details, or start a new build above.</p>
                </div>
              )}
            </div>
          </main>

          {/* Activity Feed Panel */}
          {showActivityFeed && selectedProject && (
            <aside className="w-72 border-l border-gray-700 flex-shrink-0 bg-gray-800/50 flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                <span className="text-sm font-medium text-gray-300">Activity</span>
                <button
                  onClick={() => setShowActivityFeed(false)}
                  className="p-1 text-gray-500 hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <BuildActivityFeed
                  activities={activities}
                  maxHeight="calc(100vh - 140px)"
                  onActivityClick={(activity) => {
                    if (activity.filePath && selectedProject) {
                      fetchFileContent(selectedProject, activity.filePath.replace(/^.*[/\\]/, ''));
                    }
                  }}
                />
              </div>
            </aside>
          )}

          {/* File Explorer & Preview Panel */}
          {showFileExplorer && selectedProject && (
            <aside className="w-80 border-l border-gray-700 flex-shrink-0 bg-gray-800/50 flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-300">Files</span>
                  {selectedProjectData?.localPort && (
                    <a
                      href={`http://localhost:${selectedProjectData.localPort}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded transition"
                    >
                      Preview :{ selectedProjectData.localPort}
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setShowFileExplorer(false)}
                  className="p-1 text-gray-500 hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* File Tree */}
              <div className="h-48 overflow-y-auto border-b border-gray-700">
                <BuildFileTree
                  tree={fileTree}
                  onFileSelect={handleFileSelect}
                  selectedPath={selectedFile || undefined}
                  maxHeight="100%"
                />
              </div>

              {/* File Content Viewer */}
              <div className="flex-1 overflow-hidden">
                <FileContentViewer
                  content={fileContent}
                  filename={selectedFile || ''}
                  isLoading={fileLoading}
                  onClose={() => {
                    setSelectedFile(null);
                    setFileContent(null);
                  }}
                />
              </div>
            </aside>
          )}

          {/* Toggle buttons for hidden panels */}
          {(!showActivityFeed || !showFileExplorer) && selectedProject && (
            <div className="fixed right-4 top-20 flex flex-col gap-2 z-10">
              {!showActivityFeed && (
                <button
                  onClick={() => setShowActivityFeed(true)}
                  className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg shadow-lg"
                  title="Show Activity Feed"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              )}
              {!showFileExplorer && (
                <button
                  onClick={() => setShowFileExplorer(true)}
                  className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg shadow-lg"
                  title="Show File Explorer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* GitHub Modal */}
        {githubModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-96">
              <h3 className="text-lg font-semibold mb-4">Push to GitHub</h3>
              <input
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="Repository name (e.g., my-project)"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white mb-4 focus:outline-none focus:border-purple-500"
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setGithubModalOpen(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGitHubPush}
                  disabled={actionLoading === 'github' || !githubRepo.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg transition"
                >
                  {actionLoading === 'github' ? 'Pushing...' : 'Push'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PasscodeGate>
  );
}
