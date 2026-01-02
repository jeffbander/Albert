/**
 * GitHub Integration for Albert Builder
 * Allows Albert to push built projects to GitHub repositories
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch?: string;
  token?: string; // GitHub personal access token
}

export interface PushResult {
  success: boolean;
  repoUrl?: string;
  commitHash?: string;
  error?: string;
}

/**
 * Initialize a git repository in the project directory
 */
export async function initGitRepo(projectPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if git is already initialized
    const gitDir = path.join(projectPath, '.git');
    try {
      await fs.access(gitDir);
      return { success: true }; // Already initialized
    } catch {
      // Not initialized, continue
    }

    // Initialize git
    await execAsync('git init', { cwd: projectPath });

    // Create .gitignore if it doesn't exist
    const gitignorePath = path.join(projectPath, '.gitignore');
    try {
      await fs.access(gitignorePath);
    } catch {
      const defaultGitignore = `# Dependencies
node_modules/
.pnp
.pnp.js

# Build
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Cache
.cache/
*.tsbuildinfo
`;
      await fs.writeFile(gitignorePath, defaultGitignore);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create a commit with all changes
 */
export async function createCommit(
  projectPath: string,
  message: string
): Promise<{ success: boolean; commitHash?: string; error?: string }> {
  try {
    // Add all files
    await execAsync('git add -A', { cwd: projectPath });

    // Check if there are changes to commit
    const { stdout: status } = await execAsync('git status --porcelain', { cwd: projectPath });
    if (!status.trim()) {
      return { success: true, commitHash: 'no-changes' };
    }

    // Create commit
    const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: projectPath });

    // Get commit hash
    const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: projectPath });

    return { success: true, commitHash: hash.trim() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create a new GitHub repository using the gh CLI
 */
export async function createGitHubRepo(
  repoName: string,
  description: string,
  isPrivate: boolean = true
): Promise<{ success: boolean; repoUrl?: string; error?: string }> {
  try {
    const visibility = isPrivate ? '--private' : '--public';
    const { stdout } = await execAsync(
      `gh repo create ${repoName} ${visibility} --description "${description.replace(/"/g, '\\"')}" --source=. --push`,
      { cwd: process.cwd() }
    );

    // Extract repo URL from output
    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
    const repoUrl = urlMatch ? urlMatch[0] : `https://github.com/${repoName}`;

    return { success: true, repoUrl };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Push to an existing GitHub repository
 */
export async function pushToGitHub(
  projectPath: string,
  config: GitHubConfig
): Promise<PushResult> {
  try {
    const branch = config.branch || 'main';
    const remoteUrl = config.token
      ? `https://${config.token}@github.com/${config.owner}/${config.repo}.git`
      : `https://github.com/${config.owner}/${config.repo}.git`;

    // Check if remote exists
    const { stdout: remotes } = await execAsync('git remote -v', { cwd: projectPath }).catch(() => ({ stdout: '' }));

    if (!remotes.includes('origin')) {
      // Add remote
      await execAsync(`git remote add origin ${remoteUrl}`, { cwd: projectPath });
    } else {
      // Update remote URL
      await execAsync(`git remote set-url origin ${remoteUrl}`, { cwd: projectPath });
    }

    // Ensure we're on the right branch
    const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: projectPath });
    if (currentBranch.trim() !== branch) {
      try {
        await execAsync(`git checkout -b ${branch}`, { cwd: projectPath });
      } catch {
        await execAsync(`git checkout ${branch}`, { cwd: projectPath });
      }
    }

    // Push
    await execAsync(`git push -u origin ${branch}`, { cwd: projectPath });

    // Get commit hash
    const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: projectPath });

    return {
      success: true,
      repoUrl: `https://github.com/${config.owner}/${config.repo}`,
      commitHash: hash.trim(),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Full workflow: init, commit, and push to GitHub
 */
export async function publishToGitHub(
  projectPath: string,
  config: GitHubConfig,
  commitMessage: string = 'Initial commit from Albert Builder'
): Promise<PushResult> {
  // Initialize git
  const initResult = await initGitRepo(projectPath);
  if (!initResult.success) {
    return { success: false, error: `Git init failed: ${initResult.error}` };
  }

  // Create commit
  const commitResult = await createCommit(projectPath, commitMessage);
  if (!commitResult.success) {
    return { success: false, error: `Commit failed: ${commitResult.error}` };
  }

  // Push to GitHub
  const pushResult = await pushToGitHub(projectPath, config);
  if (!pushResult.success) {
    return { success: false, error: `Push failed: ${pushResult.error}` };
  }

  return pushResult;
}

/**
 * Check if gh CLI is installed and authenticated
 */
export async function checkGitHubCLI(): Promise<{ installed: boolean; authenticated: boolean; user?: string }> {
  try {
    await execAsync('gh --version');
  } catch {
    return { installed: false, authenticated: false };
  }

  try {
    const { stdout } = await execAsync('gh auth status');
    const userMatch = stdout.match(/Logged in to github\.com account (\S+)/);
    return {
      installed: true,
      authenticated: true,
      user: userMatch ? userMatch[1] : undefined,
    };
  } catch {
    return { installed: true, authenticated: false };
  }
}
