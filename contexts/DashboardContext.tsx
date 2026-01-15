'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type {
  DashboardState,
  PanelState,
  PanelType,
  TaskItem,
  ResearchResult,
  BrowserSnapshot,
  EmailPreview,
  ServiceStatus,
  PANEL_DEFAULTS,
} from '@/types/dashboard';

interface DashboardContextType {
  state: DashboardState;
  // Panel management
  openPanel: (type: PanelType, data?: Record<string, unknown>) => string;
  closePanel: (id: string) => void;
  minimizePanel: (id: string) => void;
  restorePanel: (id: string) => void;
  focusPanel: (id: string) => void;
  updatePanelData: (id: string, data: Record<string, unknown>) => void;
  movePanel: (id: string, position: { x: number; y: number }) => void;
  resizePanel: (id: string, size: { width: number; height: number }) => void;
  // Task management
  addTask: (task: Omit<TaskItem, 'id' | 'startedAt'>) => string;
  updateTask: (id: string, updates: Partial<TaskItem>) => void;
  completeTask: (id: string, status: 'completed' | 'failed') => void;
  // Research
  addResearchResult: (result: Omit<ResearchResult, 'id' | 'timestamp'>) => void;
  // Browser
  updateBrowserSnapshot: (snapshot: Omit<BrowserSnapshot, 'timestamp'>) => void;
  // Email
  setEmails: (emails: EmailPreview[]) => void;
  // Services
  updateServiceStatus: (name: string, status: ServiceStatus['status'], message?: string) => void;
  // Voice
  setVoiceConnected: (connected: boolean) => void;
  // Helpers
  getPanelsByType: (type: PanelType) => PanelState[];
  getActiveTask: () => TaskItem | undefined;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

const PANEL_DEFAULTS_LOCAL: Record<PanelType, { width: number; height: number; title: string }> = {
  research: { width: 500, height: 600, title: 'Research' },
  browser: { width: 600, height: 500, title: 'Browser Preview' },
  email: { width: 450, height: 500, title: 'Email' },
  build: { width: 550, height: 600, title: 'Build Project' },
  terminal: { width: 600, height: 400, title: 'Terminal' },
  config: { width: 500, height: 550, title: 'Configuration' },
  voice: { width: 400, height: 300, title: 'Voice & Transcript' },
  'task-queue': { width: 350, height: 500, title: 'Task Queue' },
};

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardState>({
    panels: [],
    tasks: [],
    research: [],
    browserSnapshots: [],
    emails: [],
    services: [
      { name: 'Voice', status: 'disconnected', lastChecked: new Date() },
      { name: 'Gmail', status: 'disconnected', lastChecked: new Date() },
      { name: 'Browser', status: 'disconnected', lastChecked: new Date() },
      { name: 'Database', status: 'disconnected', lastChecked: new Date() },
      { name: 'Perplexity', status: 'disconnected', lastChecked: new Date() },
    ],
    voiceConnected: false,
    activePanelId: null,
  });

  const zIndexCounter = useRef(100);

  // Get next z-index for panel focus
  const getNextZIndex = useCallback(() => {
    zIndexCounter.current += 1;
    return zIndexCounter.current;
  }, []);

  // Calculate cascading position for new panels
  const getNextPosition = useCallback((type: PanelType) => {
    const existingOfType = state.panels.filter(p => p.type === type && p.isOpen);
    const offset = existingOfType.length * 30;

    // Center with offset
    const baseX = typeof window !== 'undefined'
      ? Math.max(100, (window.innerWidth - PANEL_DEFAULTS_LOCAL[type].width) / 2)
      : 200;
    const baseY = typeof window !== 'undefined'
      ? Math.max(100, (window.innerHeight - PANEL_DEFAULTS_LOCAL[type].height) / 2)
      : 100;

    return {
      x: baseX + offset,
      y: baseY + offset,
    };
  }, [state.panels]);

  // Open a panel
  const openPanel = useCallback((type: PanelType, data?: Record<string, unknown>): string => {
    const id = `${type}-${Date.now()}`;
    const defaults = PANEL_DEFAULTS_LOCAL[type];
    const position = getNextPosition(type);

    const newPanel: PanelState = {
      id,
      type,
      title: defaults.title,
      isOpen: true,
      isMinimized: false,
      position,
      size: { width: defaults.width, height: defaults.height },
      zIndex: getNextZIndex(),
      data,
    };

    setState(prev => ({
      ...prev,
      panels: [...prev.panels, newPanel],
      activePanelId: id,
    }));

    return id;
  }, [getNextPosition, getNextZIndex]);

  // Close a panel
  const closePanel = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.filter(p => p.id !== id),
      activePanelId: prev.activePanelId === id ? null : prev.activePanelId,
    }));
  }, []);

  // Minimize a panel
  const minimizePanel = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.map(p =>
        p.id === id ? { ...p, isMinimized: true } : p
      ),
    }));
  }, []);

  // Restore a panel
  const restorePanel = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.map(p =>
        p.id === id ? { ...p, isMinimized: false, zIndex: getNextZIndex() } : p
      ),
      activePanelId: id,
    }));
  }, [getNextZIndex]);

  // Focus a panel
  const focusPanel = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.map(p =>
        p.id === id ? { ...p, zIndex: getNextZIndex() } : p
      ),
      activePanelId: id,
    }));
  }, [getNextZIndex]);

  // Update panel data
  const updatePanelData = useCallback((id: string, data: Record<string, unknown>) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.map(p =>
        p.id === id ? { ...p, data: { ...p.data, ...data } } : p
      ),
    }));
  }, []);

  // Move panel
  const movePanel = useCallback((id: string, position: { x: number; y: number }) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.map(p =>
        p.id === id ? { ...p, position } : p
      ),
    }));
  }, []);

  // Resize panel
  const resizePanel = useCallback((id: string, size: { width: number; height: number }) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.map(p =>
        p.id === id ? { ...p, size } : p
      ),
    }));
  }, []);

  // Add a task
  const addTask = useCallback((task: Omit<TaskItem, 'id' | 'startedAt'>): string => {
    const id = `task-${Date.now()}`;
    const newTask: TaskItem = {
      ...task,
      id,
      startedAt: new Date(),
    };

    setState(prev => ({
      ...prev,
      tasks: [newTask, ...prev.tasks],
    }));

    return id;
  }, []);

  // Update a task
  const updateTask = useCallback((id: string, updates: Partial<TaskItem>) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  }, []);

  // Complete a task
  const completeTask = useCallback((id: string, status: 'completed' | 'failed') => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t =>
        t.id === id ? { ...t, status, completedAt: new Date() } : t
      ),
    }));
  }, []);

  // Add research result
  const addResearchResult = useCallback((result: Omit<ResearchResult, 'id' | 'timestamp'>) => {
    const newResult: ResearchResult = {
      ...result,
      id: `research-${Date.now()}`,
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      research: [newResult, ...prev.research],
    }));
  }, []);

  // Update browser snapshot
  const updateBrowserSnapshot = useCallback((snapshot: Omit<BrowserSnapshot, 'timestamp'>) => {
    const newSnapshot: BrowserSnapshot = {
      ...snapshot,
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      browserSnapshots: [newSnapshot, ...prev.browserSnapshots.slice(0, 9)], // Keep last 10
    }));
  }, []);

  // Set emails
  const setEmails = useCallback((emails: EmailPreview[]) => {
    setState(prev => ({
      ...prev,
      emails,
    }));
  }, []);

  // Update service status
  const updateServiceStatus = useCallback((
    name: string,
    status: ServiceStatus['status'],
    message?: string
  ) => {
    setState(prev => ({
      ...prev,
      services: prev.services.map(s =>
        s.name === name
          ? { ...s, status, message, lastChecked: new Date() }
          : s
      ),
    }));
  }, []);

  // Set voice connected
  const setVoiceConnected = useCallback((connected: boolean) => {
    setState(prev => ({
      ...prev,
      voiceConnected: connected,
    }));
    updateServiceStatus('Voice', connected ? 'connected' : 'disconnected');
  }, [updateServiceStatus]);

  // Get panels by type
  const getPanelsByType = useCallback((type: PanelType): PanelState[] => {
    return state.panels.filter(p => p.type === type);
  }, [state.panels]);

  // Get active task
  const getActiveTask = useCallback((): TaskItem | undefined => {
    return state.tasks.find(t => t.status === 'running');
  }, [state.tasks]);

  // Check service statuses on mount
  useEffect(() => {
    const checkServices = async () => {
      // Check database
      try {
        const dbRes = await fetch('/api/db/init');
        updateServiceStatus('Database', dbRes.ok ? 'connected' : 'error');
      } catch {
        updateServiceStatus('Database', 'error', 'Cannot connect');
      }

      // Check Gmail config
      try {
        const gmailRes = await fetch('/api/gmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        });
        const gmailData = await gmailRes.json();
        updateServiceStatus(
          'Gmail',
          gmailData.configured ? 'connected' : 'disconnected',
          gmailData.message
        );
      } catch {
        updateServiceStatus('Gmail', 'disconnected', 'Not configured');
      }

      // Check browser
      try {
        const browserRes = await fetch('/api/browser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'health' }),
        });
        const browserData = await browserRes.json();
        updateServiceStatus(
          'Browser',
          browserData.available ? 'connected' : 'disconnected',
          browserData.message
        );
      } catch {
        updateServiceStatus('Browser', 'disconnected', 'Not available');
      }

      // Check Perplexity
      try {
        const perplexityRes = await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'health_check' }),
        });
        updateServiceStatus(
          'Perplexity',
          perplexityRes.ok ? 'connected' : 'disconnected'
        );
      } catch {
        updateServiceStatus('Perplexity', 'disconnected', 'Not configured');
      }
    };

    checkServices();
    // Re-check every 30 seconds
    const interval = setInterval(checkServices, 30000);
    return () => clearInterval(interval);
  }, [updateServiceStatus]);

  const value: DashboardContextType = {
    state,
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    focusPanel,
    updatePanelData,
    movePanel,
    resizePanel,
    addTask,
    updateTask,
    completeTask,
    addResearchResult,
    updateBrowserSnapshot,
    setEmails,
    updateServiceStatus,
    setVoiceConnected,
    getPanelsByType,
    getActiveTask,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
