// Build project types for Albert's autonomous building capabilities

export type BuildStatus =
  | 'queued'
  | 'planning'
  | 'building'
  | 'testing'
  | 'deploying'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type ProjectType =
  | 'web-app'
  | 'api'
  | 'cli'
  | 'library'
  | 'full-stack';

export type DeployTarget = 'localhost' | 'vercel';

export interface BuildProject {
  id: string;
  description: string;
  projectType: ProjectType;
  status: BuildStatus;
  workspacePath: string;
  preferredStack?: string;
  deployTarget: DeployTarget;
  localPort?: number;
  deployUrl?: string;
  error?: string;
  buildPrompt?: string; // The actual prompt sent to Claude Code
  commitSha?: string; // Git commit SHA after auto-commit
  githubUrl?: string; // GitHub repo URL if pushed
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildLogEntry {
  id: string;
  projectId: string;
  phase: BuildStatus;
  message: string;
  timestamp: Date;
}

export interface BuildStartRequest {
  projectDescription: string;
  projectType: ProjectType;
  preferredStack?: string;
  deployTarget?: DeployTarget;
}

export interface BuildStartResponse {
  projectId: string;
  status: BuildStatus;
  message: string;
}

export interface BuildStatusResponse {
  project: BuildProject;
  logs: BuildLogEntry[];
}

export interface BuildProgressEvent {
  projectId: string;
  phase: BuildStatus;
  message: string;
  timestamp: string;
  progress?: number; // 0-100
}

// OpenAI function call types
export interface StartBuildProjectArgs {
  projectDescription: string;
  projectType: ProjectType;
  preferredStack?: string;
  deployTarget?: DeployTarget;
}

export interface CheckBuildStatusArgs {
  projectId: string;
}

export interface ModifyProjectArgs {
  projectId: string;
  changeDescription: string;
}

// Build activity types for real-time dashboard feed
export type ActivityType =
  | 'thinking'
  | 'file_write'
  | 'file_edit'
  | 'file_read'
  | 'command'
  | 'search'
  | 'decision'
  | 'web_fetch'
  | 'error'
  | 'complete';

export interface BuildActivity {
  id: string;
  timestamp: Date;
  type: ActivityType;
  summary: string;
  details?: string;
  filePath?: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  duration?: number;
}
