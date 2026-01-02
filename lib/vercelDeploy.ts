/**
 * Vercel Deployment Integration for Albert Builder
 * Allows Albert to deploy built projects to Vercel
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VercelDeployResult {
  success: boolean;
  url?: string;
  productionUrl?: string;
  projectName?: string;
  error?: string;
}

export interface VercelConfig {
  projectName?: string;
  teamId?: string;
  token?: string;
}

/**
 * Deploy a project to Vercel using the Vercel CLI
 */
export async function deployToVercel(
  projectPath: string,
  config: VercelConfig = {}
): Promise<VercelDeployResult> {
  try {
    // Build the command
    let command = 'vercel --yes';

    if (config.token) {
      command += ` --token ${config.token}`;
    }
    if (config.teamId) {
      command += ` --scope ${config.teamId}`;
    }
    if (config.projectName) {
      command += ` --name ${config.projectName}`;
    }

    // Deploy (preview)
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectPath,
      env: {
        ...process.env,
        VERCEL_TOKEN: config.token || process.env.VERCEL_TOKEN,
      }
    });

    // Extract URL from output
    const urlMatch = stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
    const previewUrl = urlMatch ? urlMatch[0] : undefined;

    if (!previewUrl) {
      return {
        success: false,
        error: `Deployment may have succeeded but no URL found. Output: ${stdout}`
      };
    }

    return {
      success: true,
      url: previewUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Deploy to production on Vercel
 */
export async function deployToProduction(
  projectPath: string,
  config: VercelConfig = {}
): Promise<VercelDeployResult> {
  try {
    let command = 'vercel --prod --yes';

    if (config.token) {
      command += ` --token ${config.token}`;
    }
    if (config.teamId) {
      command += ` --scope ${config.teamId}`;
    }
    if (config.projectName) {
      command += ` --name ${config.projectName}`;
    }

    const { stdout } = await execAsync(command, {
      cwd: projectPath,
      env: {
        ...process.env,
        VERCEL_TOKEN: config.token || process.env.VERCEL_TOKEN,
      }
    });

    // Extract URLs from output
    const urlMatch = stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
    const productionUrl = urlMatch ? urlMatch[0] : undefined;

    return {
      success: true,
      url: productionUrl,
      productionUrl,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Link a local project to an existing Vercel project
 */
export async function linkVercelProject(
  projectPath: string,
  projectName: string,
  config: VercelConfig = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    let command = `vercel link --yes --project ${projectName}`;

    if (config.token) {
      command += ` --token ${config.token}`;
    }
    if (config.teamId) {
      command += ` --scope ${config.teamId}`;
    }

    await execAsync(command, {
      cwd: projectPath,
      env: {
        ...process.env,
        VERCEL_TOKEN: config.token || process.env.VERCEL_TOKEN,
      }
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Check if Vercel CLI is installed and authenticated
 */
export async function checkVercelCLI(): Promise<{ installed: boolean; authenticated: boolean; user?: string }> {
  try {
    await execAsync('vercel --version');
  } catch {
    return { installed: false, authenticated: false };
  }

  try {
    const { stdout } = await execAsync('vercel whoami');
    return {
      installed: true,
      authenticated: true,
      user: stdout.trim(),
    };
  } catch {
    // Try with token from env
    if (process.env.VERCEL_TOKEN) {
      try {
        const { stdout } = await execAsync(`vercel whoami --token ${process.env.VERCEL_TOKEN}`);
        return {
          installed: true,
          authenticated: true,
          user: stdout.trim(),
        };
      } catch {
        return { installed: true, authenticated: false };
      }
    }
    return { installed: true, authenticated: false };
  }
}

/**
 * Get list of Vercel projects
 */
export async function listVercelProjects(
  config: VercelConfig = {}
): Promise<{ success: boolean; projects?: string[]; error?: string }> {
  try {
    let command = 'vercel projects list';

    if (config.token) {
      command += ` --token ${config.token}`;
    }
    if (config.teamId) {
      command += ` --scope ${config.teamId}`;
    }

    const { stdout } = await execAsync(command, {
      env: {
        ...process.env,
        VERCEL_TOKEN: config.token || process.env.VERCEL_TOKEN,
      }
    });

    // Parse project names from output
    const lines = stdout.split('\n').filter(line => line.trim());
    const projects = lines.slice(1).map(line => line.split(/\s+/)[0]).filter(Boolean);

    return { success: true, projects };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
