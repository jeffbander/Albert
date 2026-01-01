import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';

const DEFAULT_WORKSPACE_ROOT = path.join(homedir(), '.albert', 'projects');

/**
 * Get the root directory for all build projects
 */
export function getWorkspaceRoot(): string {
  return process.env.BUILD_WORKSPACE_ROOT || DEFAULT_WORKSPACE_ROOT;
}

/**
 * Create a new project workspace directory
 */
export async function createProjectWorkspace(projectId: string): Promise<string> {
  const workspacePath = path.join(getWorkspaceRoot(), projectId);
  await fs.mkdir(workspacePath, { recursive: true });
  return workspacePath;
}

/**
 * Check if a project workspace exists
 */
export async function workspaceExists(projectId: string): Promise<boolean> {
  const workspacePath = path.join(getWorkspaceRoot(), projectId);
  try {
    await fs.access(workspacePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to a project workspace
 */
export function getWorkspacePath(projectId: string): string {
  return path.join(getWorkspaceRoot(), projectId);
}

/**
 * List all files in a project workspace recursively
 */
export async function listWorkspaceFiles(
  projectId: string,
  relativePath: string = ''
): Promise<string[]> {
  const workspacePath = path.join(getWorkspaceRoot(), projectId, relativePath);
  const files: string[] = [];

  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name);

      // Skip node_modules and .git directories
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await listWorkspaceFiles(projectId, entryPath);
        files.push(...subFiles);
      } else {
        files.push(entryPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    console.error(`[Workspace] Error listing files in ${workspacePath}:`, error);
  }

  return files;
}

/**
 * Read a file from a project workspace
 */
export async function readWorkspaceFile(
  projectId: string,
  filePath: string
): Promise<string> {
  const fullPath = path.join(getWorkspaceRoot(), projectId, filePath);
  return fs.readFile(fullPath, 'utf-8');
}

/**
 * Write a file to a project workspace
 */
export async function writeWorkspaceFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  const fullPath = path.join(getWorkspaceRoot(), projectId, filePath);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

/**
 * Delete a project workspace and all its contents
 */
export async function deleteWorkspace(projectId: string): Promise<void> {
  const workspacePath = path.join(getWorkspaceRoot(), projectId);
  try {
    await fs.rm(workspacePath, { recursive: true, force: true });
  } catch (error) {
    console.error(`[Workspace] Error deleting workspace ${projectId}:`, error);
  }
}

/**
 * Get workspace disk usage in bytes
 */
export async function getWorkspaceSize(projectId: string): Promise<number> {
  const workspacePath = path.join(getWorkspaceRoot(), projectId);
  let totalSize = 0;

  async function calculateSize(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.name === 'node_modules') {
          continue; // Skip node_modules for faster calculation
        }

        if (entry.isDirectory()) {
          await calculateSize(entryPath);
        } else {
          const stats = await fs.stat(entryPath);
          totalSize += stats.size;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  await calculateSize(workspacePath);
  return totalSize;
}

/**
 * Initialize the workspace root directory
 */
export async function initWorkspaceRoot(): Promise<void> {
  const root = getWorkspaceRoot();
  await fs.mkdir(root, { recursive: true });
  console.log(`[Workspace] Initialized workspace root at ${root}`);
}

/**
 * Find an available port for the dev server
 */
export async function findAvailablePort(startPort: number = 3100): Promise<number> {
  const net = await import('net');

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try the next one
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}
