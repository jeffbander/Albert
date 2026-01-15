// Dashboard Panel Types

export type PanelType =
  | 'research'
  | 'browser'
  | 'email'
  | 'build'
  | 'terminal'
  | 'config'
  | 'voice'
  | 'task-queue';

export interface PanelState {
  id: string;
  type: PanelType;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  data?: Record<string, unknown>;
}

export interface TaskItem {
  id: string;
  type: 'research' | 'build' | 'email' | 'browser' | 'skill';
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ResearchResult {
  id: string;
  topic: string;
  answer: string;
  citations: string[];
  timestamp: Date;
  isDeepResearch?: boolean;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  screenshot?: string; // base64
  timestamp: Date;
}

export interface EmailPreview {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  timestamp: Date;
  isRead: boolean;
}

export interface ServiceStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'configuring';
  message?: string;
  lastChecked: Date;
}

export interface DashboardState {
  panels: PanelState[];
  tasks: TaskItem[];
  research: ResearchResult[];
  browserSnapshots: BrowserSnapshot[];
  emails: EmailPreview[];
  services: ServiceStatus[];
  voiceConnected: boolean;
  activePanelId: string | null;
}

// Panel default configurations
export const PANEL_DEFAULTS: Record<PanelType, { width: number; height: number; title: string }> = {
  research: { width: 500, height: 600, title: 'Research' },
  browser: { width: 600, height: 500, title: 'Browser Preview' },
  email: { width: 450, height: 500, title: 'Email' },
  build: { width: 550, height: 600, title: 'Build Project' },
  terminal: { width: 600, height: 400, title: 'Terminal' },
  config: { width: 500, height: 550, title: 'Configuration' },
  voice: { width: 400, height: 300, title: 'Voice & Transcript' },
  'task-queue': { width: 350, height: 500, title: 'Task Queue' },
};

// Voice commands that should trigger panels
export const VOICE_PANEL_TRIGGERS: Record<string, PanelType> = {
  'research': 'research',
  'look up': 'research',
  'search for': 'research',
  'find out': 'research',
  'check email': 'email',
  'read email': 'email',
  'send email': 'email',
  'compose email': 'email',
  'open browser': 'browser',
  'go to': 'browser',
  'navigate to': 'browser',
  'build': 'build',
  'create': 'build',
  'make me': 'build',
  'run command': 'terminal',
  'settings': 'config',
  'configure': 'config',
};
