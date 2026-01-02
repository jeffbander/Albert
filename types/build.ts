// Build project types for Albert's autonomous building capabilities

export type BuildStatus =
  | 'queued'
  | 'planning'
  | 'building'
  | 'testing'
  | 'deploying'
  | 'complete'
  | 'failed';

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
