/**
 * Workspace Watcher - Real-time file system monitoring for build projects
 * Provides live visibility into file changes during builds.
 */

import { watch, type FSWatcher, stat, readdir } from 'fs';
import { readFile } from 'fs/promises';
import { join, relative, basename, extname } from 'path';
import { EventEmitter } from 'events';

export interface FileEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  relativePath: string;
  timestamp: Date;
  isDirectory: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  children?: FileNode[];
  size?: number;
  modifiedAt?: Date;
  isNew?: boolean; // Highlight newly created files
}

// Files/directories to ignore during watching
const IGNORED_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  '__pycache__',
  '.DS_Store',
  'thumbs.db',
  '*.log',
];

function shouldIgnore(filename: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => {
    if (pattern.startsWith('*')) {
      return filename.endsWith(pattern.slice(1));
    }
    return filename === pattern || filename.startsWith(pattern + '/');
  });
}

/**
 * Workspace watcher class for monitoring file changes
 */
export class WorkspaceWatcher extends EventEmitter {
  private rootPath: string;
  private watchers: Map<string, FSWatcher> = new Map();
  private fileTree: FileNode | null = null;
  private recentFiles: Set<string> = new Set();
  private isActive: boolean = false;

  constructor(rootPath: string) {
    super();
    this.rootPath = rootPath;
  }

  /**
   * Start watching the workspace
   */
  async start(): Promise<void> {
    if (this.isActive) return;
    this.isActive = true;

    // Build initial file tree
    this.fileTree = await this.buildFileTree(this.rootPath);

    // Set up watchers recursively
    await this.setupWatchers(this.rootPath);

    this.emit('ready', this.fileTree);
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.isActive = false;
    this.watchers.forEach((watcher) => watcher.close());
    this.watchers.clear();
    this.recentFiles.clear();
  }

  /**
   * Get the current file tree
   */
  getFileTree(): FileNode | null {
    return this.fileTree;
  }

  /**
   * Check if a file was recently created
   */
  isRecentlyCreated(relativePath: string): boolean {
    return this.recentFiles.has(relativePath);
  }

  /**
   * Build the file tree structure
   */
  private async buildFileTree(dirPath: string): Promise<FileNode> {
    const name = basename(dirPath);
    const relativePath = relative(this.rootPath, dirPath) || '.';

    const node: FileNode = {
      name: name || basename(this.rootPath),
      path: dirPath,
      relativePath,
      isDirectory: true,
      children: [],
    };

    try {
      const entries = await new Promise<string[]>((resolve, reject) => {
        readdir(dirPath, (err, files) => {
          if (err) reject(err);
          else resolve(files);
        });
      });

      for (const entry of entries) {
        if (shouldIgnore(entry)) continue;

        const fullPath = join(dirPath, entry);
        const stats = await new Promise<import('fs').Stats>((resolve, reject) => {
          stat(fullPath, (err, stats) => {
            if (err) reject(err);
            else resolve(stats);
          });
        }).catch(() => null);

        if (!stats) continue;

        if (stats.isDirectory()) {
          const childNode = await this.buildFileTree(fullPath);
          node.children?.push(childNode);
        } else {
          node.children?.push({
            name: entry,
            path: fullPath,
            relativePath: relative(this.rootPath, fullPath),
            isDirectory: false,
            size: stats.size,
            modifiedAt: stats.mtime,
            isNew: this.recentFiles.has(relative(this.rootPath, fullPath)),
          });
        }
      }

      // Sort: directories first, then alphabetically
      node.children?.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      // Directory might not exist yet during build
    }

    return node;
  }

  /**
   * Set up file system watchers
   */
  private async setupWatchers(dirPath: string): Promise<void> {
    if (!this.isActive) return;

    try {
      const watcher = watch(dirPath, { persistent: false }, async (eventType, filename) => {
        if (!filename || shouldIgnore(filename)) return;

        const fullPath = join(dirPath, filename);
        const relativePath = relative(this.rootPath, fullPath);

        // Get file stats
        const stats = await new Promise<import('fs').Stats | null>((resolve) => {
          stat(fullPath, (err, stats) => resolve(err ? null : stats));
        });

        const event: FileEvent = {
          type: stats ? (eventType === 'rename' ? 'created' : 'modified') : 'deleted',
          path: fullPath,
          relativePath,
          timestamp: new Date(),
          isDirectory: stats?.isDirectory() ?? false,
        };

        // Track new files
        if (event.type === 'created') {
          this.recentFiles.add(relativePath);
          // Clear "new" status after 30 seconds
          setTimeout(() => {
            this.recentFiles.delete(relativePath);
            this.emit('file-aged', relativePath);
          }, 30000);
        }

        // Rebuild file tree on changes
        this.fileTree = await this.buildFileTree(this.rootPath);

        this.emit('change', event);
        this.emit('tree-updated', this.fileTree);

        // If a new directory was created, watch it too
        if (event.type === 'created' && event.isDirectory) {
          await this.setupWatchers(fullPath);
        }
      });

      this.watchers.set(dirPath, watcher);

      // Watch subdirectories
      const entries = await new Promise<string[]>((resolve) => {
        readdir(dirPath, (err, files) => resolve(err ? [] : files));
      });

      for (const entry of entries) {
        if (shouldIgnore(entry)) continue;

        const fullPath = join(dirPath, entry);
        const stats = await new Promise<import('fs').Stats | null>((resolve) => {
          stat(fullPath, (err, stats) => resolve(err ? null : stats));
        });

        if (stats?.isDirectory()) {
          await this.setupWatchers(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }

  /**
   * Refresh the file tree
   */
  async refresh(): Promise<FileNode> {
    this.fileTree = await this.buildFileTree(this.rootPath);
    this.emit('tree-updated', this.fileTree);
    return this.fileTree;
  }
}

// Store active watchers by project ID
const activeWatchers = new Map<string, WorkspaceWatcher>();

/**
 * Start watching a project workspace
 */
export async function watchWorkspace(
  projectId: string,
  workspacePath: string,
  callbacks: {
    onFileChange?: (event: FileEvent) => void;
    onTreeUpdate?: (tree: FileNode) => void;
    onReady?: (tree: FileNode) => void;
  }
): Promise<() => void> {
  // Stop any existing watcher for this project
  stopWatching(projectId);

  const watcher = new WorkspaceWatcher(workspacePath);

  if (callbacks.onFileChange) {
    watcher.on('change', callbacks.onFileChange);
  }
  if (callbacks.onTreeUpdate) {
    watcher.on('tree-updated', callbacks.onTreeUpdate);
  }
  if (callbacks.onReady) {
    watcher.on('ready', callbacks.onReady);
  }

  activeWatchers.set(projectId, watcher);

  await watcher.start();

  // Return cleanup function
  return () => stopWatching(projectId);
}

/**
 * Stop watching a project
 */
export function stopWatching(projectId: string): void {
  const watcher = activeWatchers.get(projectId);
  if (watcher) {
    watcher.stop();
    activeWatchers.delete(projectId);
  }
}

/**
 * Get the file tree for a project
 */
export function getFileTree(projectId: string): FileNode | null {
  const watcher = activeWatchers.get(projectId);
  return watcher?.getFileTree() || null;
}

/**
 * Read a file's contents
 */
export async function readProjectFile(
  workspacePath: string,
  relativePath: string
): Promise<{ content: string; extension: string; size: number } | null> {
  try {
    const fullPath = join(workspacePath, relativePath);
    const content = await readFile(fullPath, 'utf-8');
    const extension = extname(relativePath).slice(1);

    return {
      content,
      extension,
      size: Buffer.byteLength(content, 'utf-8'),
    };
  } catch (error) {
    return null;
  }
}

/**
 * List all files in a project (flat list)
 */
export async function listProjectFiles(workspacePath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    try {
      const entries = await new Promise<string[]>((resolve, reject) => {
        readdir(dir, (err, files) => {
          if (err) reject(err);
          else resolve(files);
        });
      });

      for (const entry of entries) {
        if (shouldIgnore(entry)) continue;

        const fullPath = join(dir, entry);
        const stats = await new Promise<import('fs').Stats>((resolve, reject) => {
          stat(fullPath, (err, stats) => {
            if (err) reject(err);
            else resolve(stats);
          });
        }).catch(() => null);

        if (!stats) continue;

        const relativePath = relative(workspacePath, fullPath);

        if (stats.isDirectory()) {
          await walk(fullPath);
        } else {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  await walk(workspacePath);
  return files.sort();
}

/**
 * Get file extension icon (for UI)
 */
export function getFileIcon(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const iconMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'react',
    '.js': 'javascript',
    '.jsx': 'react',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'sass',
    '.html': 'html',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.env': 'env',
    '.gitignore': 'git',
  };
  return iconMap[ext] || 'file';
}

/**
 * Get language for syntax highlighting
 */
export function getLanguage(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sh': 'bash',
    '.bash': 'bash',
    '.sql': 'sql',
  };
  return langMap[ext] || 'text';
}
