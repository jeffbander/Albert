/**
 * Research Types
 * Type definitions for NotebookLM research integration
 */

export type ResearchPhase =
  | 'initializing'
  | 'creating_notebook'
  | 'adding_sources'
  | 'processing'
  | 'ready'
  | 'querying'
  | 'complete'
  | 'error';

export interface ResearchSource {
  id: string;
  type: 'url' | 'youtube' | 'google_doc' | 'text';
  content: string;
  description?: string;
  addedAt: Date;
  status: 'pending' | 'added' | 'failed';
}

export interface ResearchQuestion {
  id: string;
  question: string;
  answer?: string;
  askedAt: Date;
  answeredAt?: Date;
}

export interface ResearchSession {
  id: string;
  topic: string;
  notebookUrl?: string;
  phase: ResearchPhase;
  sources: ResearchSource[];
  questions: ResearchQuestion[];
  tabId?: number;  // Chrome tab ID from claude-in-chrome
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

export interface ResearchProgressEvent {
  sessionId: string;
  phase: ResearchPhase;
  message: string;
  progress?: number;
  timestamp: string;
  answer?: string;  // For query responses
}

export interface ResearchProgressCallback {
  onProgress: (event: ResearchProgressEvent) => void;
  onComplete: (sessionId: string, summary: string) => void;
  onError: (sessionId: string, error: string) => void;
}
