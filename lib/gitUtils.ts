/**
 * Git utilities for auto-committing and pushing project changes
 */

import { spawn } from 'child_process';

export interface CommitResult {
  success: boolean;
  sha?: string;
  error?: string;
  pushed?: boolean;
}

/**
 * Initialize a git repository in the workspace
 */
export async function initGitRepo(workspacePath: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const gitProcess = spawn('git', ['init'], {
      cwd: workspacePath,
      shell: true,
    });

    let errorOutput = '';

    gitProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: errorOutput });
      }
    });

    gitProcess.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Auto-commit changes in a project workspace
 */
export async function autoCommitProject(
  workspacePath: string,
  projectDescription: string,
  options: {
    push?: boolean;
    remote?: string;
    branch?: string;
  } = {}
): Promise<CommitResult> {
  const { push = false, remote = 'origin', branch = 'main' } = options;

  // First, ensure git is initialized
  await initGitRepo(workspacePath);

  return new Promise((resolve) => {
    const shortDescription = projectDescription.slice(0, 50) + (projectDescription.length > 50 ? '...' : '');

    const commitMessage = `🚀 Build: ${shortDescription}

Built autonomously by Albert using Claude Code.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`;

    // Build command chain: add all, commit
    let commands = `git add -A && git commit -m "${commitMessage.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    // Add push if requested
    if (push) {
      commands += ` && git push ${remote} ${branch}`;
    }

    const gitProcess = spawn('bash', ['-c', commands], {
      cwd: workspacePath,
      shell: true,
    });

    let output = '';
    let errorOutput = '';

    gitProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    gitProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        // Extract commit SHA from output
        const shaMatch = output.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
        resolve({
          success: true,
          sha: shaMatch ? shaMatch[1] : undefined,
          pushed: push,
        });
      } else {
        // Check if it's just "nothing to commit"
        if (errorOutput.includes('nothing to commit') || output.includes('nothing to commit')) {
          resolve({
            success: true,
            error: 'Nothing to commit - no changes detected',
          });
        } else {
          resolve({
            success: false,
            error: errorOutput || 'Git commit failed',
          });
        }
      }
    });

    gitProcess.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Push changes to a remote GitHub repository
 */
export async function pushToGitHub(
  workspacePath: string,
  repoName: string,
  options: {
    owner?: string;
    branch?: string;
    createRepo?: boolean;
  } = {}
): Promise<{ success: boolean; repoUrl?: string; error?: string }> {
  const { owner, branch = 'main', createRepo = true } = options;

  return new Promise(async (resolve) => {
    // If createRepo is true, try to create the repo first using gh CLI
    if (createRepo) {
      const ghCreateProcess = spawn('gh', [
        'repo', 'create', repoName,
        '--public',
        '--source', '.',
        '--push'
      ], {
        cwd: workspacePath,
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      ghCreateProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      ghCreateProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ghCreateProcess.on('close', (code) => {
        if (code === 0) {
          // Extract repo URL from output
          const urlMatch = output.match(/https:\/\/github\.com\/[\w-]+\/[\w-]+/);
          resolve({
            success: true,
            repoUrl: urlMatch ? urlMatch[0] : `https://github.com/${owner || 'user'}/${repoName}`,
          });
        } else {
          // If repo already exists, try to add remote and push
          const remoteUrl = owner
            ? `https://github.com/${owner}/${repoName}.git`
            : `https://github.com/${repoName}.git`;

          const pushCommands = `git remote add origin ${remoteUrl} 2>/dev/null || git remote set-url origin ${remoteUrl} && git push -u origin ${branch}`;

          const pushProcess = spawn('bash', ['-c', pushCommands], {
            cwd: workspacePath,
            shell: true,
          });

          let pushError = '';

          pushProcess.stderr.on('data', (data) => {
            pushError += data.toString();
          });

          pushProcess.on('close', (pushCode) => {
            if (pushCode === 0) {
              resolve({
                success: true,
                repoUrl: remoteUrl.replace('.git', ''),
              });
            } else {
              resolve({
                success: false,
                error: pushError || errorOutput || 'Failed to push to GitHub',
              });
            }
          });
        }
      });

      ghCreateProcess.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    } else {
      // Just push to existing remote
      const pushProcess = spawn('git', ['push', '-u', 'origin', branch], {
        cwd: workspacePath,
        shell: true,
      });

      let errorOutput = '';

      pushProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pushProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            repoUrl: `https://github.com/${owner || 'user'}/${repoName}`,
          });
        } else {
          resolve({
            success: false,
            error: errorOutput || 'Failed to push to GitHub',
          });
        }
      });
    }
  });
}

/**
 * Get the current git status of a workspace
 */
export async function getGitStatus(workspacePath: string): Promise<{
  hasChanges: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
}> {
  return new Promise((resolve) => {
    const statusProcess = spawn('git', ['status', '--porcelain', '-b'], {
      cwd: workspacePath,
      shell: true,
    });

    let output = '';

    statusProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    statusProcess.on('close', (code) => {
      if (code === 0) {
        const lines = output.trim().split('\n');
        const branchLine = lines[0] || '';
        const branchMatch = branchLine.match(/^## (\S+)/);
        const aheadMatch = branchLine.match(/ahead (\d+)/);
        const behindMatch = branchLine.match(/behind (\d+)/);

        resolve({
          hasChanges: lines.length > 1,
          branch: branchMatch ? branchMatch[1] : undefined,
          ahead: aheadMatch ? parseInt(aheadMatch[1]) : 0,
          behind: behindMatch ? parseInt(behindMatch[1]) : 0,
        });
      } else {
        resolve({ hasChanges: false });
      }
    });

    statusProcess.on('error', () => {
      resolve({ hasChanges: false });
    });
  });
}
