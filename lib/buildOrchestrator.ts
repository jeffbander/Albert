/**
 * Build Orchestrator - Manages the lifecycle of build projects
 * Coordinates between Claude Code, workspace management, and the database.
 */

import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';
import type {
  BuildProject,
  BuildStatus,
  ProjectType,
  DeployTarget,
  BuildProgressEvent,
} from '@/types/build';
import {
  createBuildProject,
  getBuildProject,
  getAllBuildProjects,
  updateBuildProjectStatus,
  addBuildLog,
  getBuildLogs,
} from '@/lib/db';
import {
  createProjectWorkspace,
  getWorkspacePath,
  deleteWorkspace,
  findAvailablePort,
  initWorkspaceRoot,
} from '@/lib/workspaceManager';
import {
  buildProject as claudeBuildProject,
  modifyProject as claudeModifyProject,
  testProject as claudeTestProject,
  generateBuildPrompt,
  type ClaudeCodeMessage,
} from '@/lib/claudeCodeClient';
import {
  saveBuildPattern,
  savePreferencesFromBuild,
  getBuildContext,
} from '@/lib/buildMemory';

// Global event emitter for build progress
const buildEvents = new EventEmitter();
buildEvents.setMaxListeners(100); // Allow many subscribers

// Track running dev servers
const runningServers = new Map<string, ChildProcess>();

/**
 * Subscribe to build progress events
 */
export function subscribeToBuildProgress(
  projectId: string,
  callback: (event: BuildProgressEvent) => void
): () => void {
  const eventName = `progress:${projectId}`;
  buildEvents.on(eventName, callback);
  return () => buildEvents.off(eventName, callback);
}

/**
 * Emit a build progress event
 */
export function emitBuildProgress(
  projectId: string,
  phase: BuildStatus,
  message: string,
  progress?: number
): void {
  const event: BuildProgressEvent = {
    projectId,
    phase,
    message,
    timestamp: new Date().toISOString(),
    progress,
  };
  buildEvents.emit(`progress:${projectId}`, event);
}

/**
 * Start a new build project
 */
export async function startBuild(options: {
  description: string;
  projectType: ProjectType;
  preferredStack?: string;
  deployTarget?: DeployTarget;
}): Promise<string> {
  // Initialize workspace root if needed
  await initWorkspaceRoot();

  // Create workspace directory
  const projectId = crypto.randomUUID();
  const workspacePath = await createProjectWorkspace(projectId);

  // Create database record
  await createBuildProject(
    projectId,
    options.description,
    options.projectType,
    workspacePath,
    {
      preferredStack: options.preferredStack,
      deployTarget: options.deployTarget || 'localhost',
    }
  );

  // Start the build process asynchronously
  executeBuild(projectId, options).catch(async (error) => {
    console.error(`[BuildOrchestrator] Build ${projectId} failed:`, error);
    await updateBuildProjectStatus(projectId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    emitBuildProgress(projectId, 'failed', `Build failed: ${error.message}`);

    // Save failed build pattern to memory (for Albert's learning)
    const project = await getBuildProject(projectId);
    if (project) {
      await saveBuildPattern(project, false);
    }
  });

  return projectId;
}

/**
 * Execute the build process
 */
async function executeBuild(
  projectId: string,
  options: {
    description: string;
    projectType: ProjectType;
    preferredStack?: string;
    deployTarget?: DeployTarget;
  }
): Promise<void> {
  const workspacePath = getWorkspacePath(projectId);
  const buildStartTime = Date.now();

  // Phase 1: Planning (includes fetching build context from memory)
  await updateBuildProjectStatus(projectId, 'planning');
  await addBuildLog(projectId, 'planning', 'Analyzing requirements...');
  emitBuildProgress(projectId, 'planning', 'Analyzing requirements and planning project structure...', 10);

  // Fetch build context from memory (past patterns, preferences, lessons learned)
  const buildContext = await getBuildContext(options.description, options.projectType);
  if (buildContext !== 'No prior build context available.') {
    await addBuildLog(projectId, 'planning', 'Found relevant build patterns from past experience');
    emitBuildProgress(projectId, 'planning', 'Using past experience to inform this build...', 15);
  }

  // Phase 2: Building with Claude Code
  await updateBuildProjectStatus(projectId, 'building');
  await addBuildLog(projectId, 'building', 'Starting Claude Code build...');
  emitBuildProgress(projectId, 'building', 'Claude Code is building your project...', 20);

  const buildResult = await claudeBuildProject(
    options.description,
    options.projectType,
    workspacePath,
    {
      preferredStack: options.preferredStack,
      buildContext, // Pass learned context to Claude Code
      onMessage: async (msg: ClaudeCodeMessage) => {
        // Log significant messages
        if (msg.type === 'assistant' && msg.content) {
          const preview = msg.content.slice(0, 200);
          await addBuildLog(projectId, 'building', preview);
          emitBuildProgress(projectId, 'building', preview, 50);
        }
      },
    }
  );

  // Save the actual prompt that was sent to Claude Code
  if (buildResult.prompt) {
    await updateBuildProjectStatus(projectId, 'building', {
      buildPrompt: buildResult.prompt,
    });
  }

  if (!buildResult.success) {
    throw new Error(buildResult.error || 'Build failed');
  }

  // Phase 3: Testing
  await updateBuildProjectStatus(projectId, 'testing');
  await addBuildLog(projectId, 'testing', 'Testing project...');
  emitBuildProgress(projectId, 'testing', 'Verifying project works correctly...', 70);

  const testResult = await claudeTestProject(workspacePath, {
    onMessage: async (msg: ClaudeCodeMessage) => {
      if (msg.type === 'assistant' && msg.content) {
        await addBuildLog(projectId, 'testing', msg.content.slice(0, 200));
      }
    },
  });

  if (!testResult.success) {
    console.warn(`[BuildOrchestrator] Tests had issues: ${testResult.error}`);
    await addBuildLog(projectId, 'testing', `Warning: ${testResult.error}`);
  }

  // Phase 4: Deploying
  await updateBuildProjectStatus(projectId, 'deploying');
  emitBuildProgress(projectId, 'deploying', 'Starting deployment...', 85);

  const deployTarget = options.deployTarget || 'localhost';

  if (deployTarget === 'localhost') {
    // Start local dev server
    const port = await startDevServer(projectId, workspacePath);
    await updateBuildProjectStatus(projectId, 'complete', { localPort: port });
    await addBuildLog(projectId, 'complete', `Project running at http://localhost:${port}`);
    emitBuildProgress(projectId, 'complete', `Build complete! Running at http://localhost:${port}`, 100);
  } else {
    // Deploy to Vercel (will be implemented)
    await addBuildLog(projectId, 'deploying', 'Vercel deployment not yet implemented');
    await updateBuildProjectStatus(projectId, 'complete');
    emitBuildProgress(projectId, 'complete', 'Build complete! (Vercel deployment pending)', 100);
  }

  // Save build pattern and preferences to memory (for Albert's learning)
  const buildDuration = Date.now() - buildStartTime;
  const project = await getBuildProject(projectId);
  if (project) {
    await saveBuildPattern(project, true, buildDuration);
    await savePreferencesFromBuild(project);
  }
}

/**
 * Start a development server for a project
 */
async function startDevServer(projectId: string, workspacePath: string): Promise<number> {
  const port = await findAvailablePort(3100);

  // Try to detect and start the appropriate dev server
  // Check for common project types
  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    let command: string;
    let args: string[];

    if (packageJson.scripts?.dev) {
      command = 'npm';
      args = ['run', 'dev', '--', '--port', String(port)];
    } else if (packageJson.scripts?.start) {
      command = 'npm';
      args = ['run', 'start'];
    } else {
      // Default to serving static files
      command = 'npx';
      args = ['serve', '-l', String(port)];
    }

    // Install dependencies first
    await addBuildLog(projectId, 'deploying', 'Installing dependencies...');
    await new Promise<void>((resolve, reject) => {
      const install = spawn('npm', ['install'], {
        cwd: workspacePath,
        shell: true,
      });
      install.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install failed with code ${code}`));
      });
    });

    // Start the dev server
    await addBuildLog(projectId, 'deploying', `Starting server on port ${port}...`);
    const server = spawn(command, args, {
      cwd: workspacePath,
      shell: true,
      detached: true,
      stdio: 'ignore',
    });

    server.unref();
    runningServers.set(projectId, server);

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return port;
  } catch (error) {
    console.error(`[BuildOrchestrator] Failed to start dev server:`, error);
    // Still return the port, project might be static
    return port;
  }
}

/**
 * Stop a running dev server
 */
export function stopDevServer(projectId: string): boolean {
  const server = runningServers.get(projectId);
  if (server) {
    server.kill();
    runningServers.delete(projectId);
    return true;
  }
  return false;
}

/**
 * Modify an existing project
 */
export async function modifyExistingProject(
  projectId: string,
  changeDescription: string
): Promise<void> {
  const project = await getBuildProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  await updateBuildProjectStatus(projectId, 'building');
  emitBuildProgress(projectId, 'building', 'Applying changes...');

  const result = await claudeModifyProject(changeDescription, project.workspacePath, {
    onMessage: async (msg: ClaudeCodeMessage) => {
      if (msg.type === 'assistant' && msg.content) {
        await addBuildLog(projectId, 'building', msg.content.slice(0, 200));
        emitBuildProgress(projectId, 'building', msg.content.slice(0, 100));
      }
    },
  });

  if (!result.success) {
    await updateBuildProjectStatus(projectId, 'failed', { error: result.error });
    throw new Error(result.error);
  }

  await updateBuildProjectStatus(projectId, 'complete');
  emitBuildProgress(projectId, 'complete', 'Changes applied successfully!');
}

/**
 * Get project status with logs
 */
export async function getProjectStatus(projectId: string): Promise<{
  project: BuildProject | null;
  logs: Awaited<ReturnType<typeof getBuildLogs>>;
}> {
  const project = await getBuildProject(projectId);
  const logs = await getBuildLogs(projectId);
  return { project, logs };
}

/**
 * List all projects
 */
export async function listProjects(): Promise<BuildProject[]> {
  return getAllBuildProjects();
}

/**
 * Delete a project and its workspace
 */
export async function deleteProject(projectId: string): Promise<void> {
  // Stop any running server
  stopDevServer(projectId);

  // Delete workspace
  await deleteWorkspace(projectId);

  // Database record will be deleted via the API
}

/**
 * Get the most recent project
 */
export async function getMostRecentProject(): Promise<BuildProject | null> {
  const projects = await getAllBuildProjects();
  return projects[0] || null;
}

// Track active build abort controllers
const activeBuildControllers = new Map<string, AbortController>();

/**
 * Register an abort controller for a build
 */
export function registerBuildController(projectId: string, controller: AbortController): void {
  activeBuildControllers.set(projectId, controller);
}

/**
 * Unregister an abort controller
 */
export function unregisterBuildController(projectId: string): void {
  activeBuildControllers.delete(projectId);
}

/**
 * Cancel a running build
 */
export async function cancelBuild(projectId: string): Promise<boolean> {
  const controller = activeBuildControllers.get(projectId);

  // Stop any running dev server
  stopDevServer(projectId);

  // Update status
  await updateBuildProjectStatus(projectId, 'failed', {
    error: 'Build cancelled by user',
  });
  emitBuildProgress(projectId, 'failed', 'Build cancelled by user');

  // If we have an abort controller, use it
  if (controller) {
    controller.abort();
    activeBuildControllers.delete(projectId);
    return true;
  }

  return true;
}

/**
 * Retry a failed build with optional modifications
 */
export async function retryBuild(
  projectId: string,
  modifications?: string
): Promise<string> {
  const project = await getBuildProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Create a modified description if modifications were provided
  let description = project.description;
  if (modifications) {
    description = `${project.description}\n\nIMPORTANT MODIFICATIONS FOR RETRY: ${modifications}`;
  }

  // Start a new build with the same settings
  const newProjectId = await startBuild({
    description,
    projectType: project.projectType as ProjectType,
    preferredStack: project.preferredStack || undefined,
    deployTarget: (project.deployTarget as DeployTarget) || 'localhost',
  });

  return newProjectId;
}

/**
 * Get the most recent running build
 */
export async function getMostRecentRunningBuild(): Promise<BuildProject | null> {
  const projects = await getAllBuildProjects();
  return projects.find(p =>
    p.status === 'building' || p.status === 'planning' || p.status === 'testing' || p.status === 'deploying'
  ) || null;
}
