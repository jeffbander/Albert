import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runClaudeCode, type ClaudeCodeMessage } from '@/lib/claudeCodeClient';
import { type BuildActivity, ActivityTracker } from '@/lib/buildActivityParser';
import {
  getActiveImprovement,
  setActiveImprovement,
  getAllActiveImprovementIds,
  getRunningCount,
  updateActiveImprovementStatus,
} from '@/lib/selfImprovementStore';
import { autoCommitSelfImprovement } from '@/lib/gitUtils';

// Albert's project root
const ALBERT_ROOT = process.cwd();

// Log file for self-improvement actions
const LOG_FILE = path.join(ALBERT_ROOT, 'self-improvement-log.json');

// Rate limiting configuration
const MAX_CONCURRENT_IMPROVEMENTS = 1;
const COOLDOWN_MS = 30000; // 30 seconds between improvements
const MAX_IMPROVEMENT_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Track last improvement start time for cooldown
let lastImprovementStartTime = 0;

// Track running improvements with timeouts
const improvementTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Set up timeout for an improvement
 */
function setupImprovementTimeout(logId: string, onTimeout: () => void): void {
  // Clear any existing timeout
  const existingTimeout = improvementTimeouts.get(logId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set new timeout
  const timeout = setTimeout(() => {
    console.warn(`[Self-Improve] Improvement ${logId} timed out after ${MAX_IMPROVEMENT_DURATION_MS / 60000} minutes`);
    improvementTimeouts.delete(logId);
    onTimeout();
  }, MAX_IMPROVEMENT_DURATION_MS);

  improvementTimeouts.set(logId, timeout);
}

/**
 * Clear timeout for an improvement (called when complete/failed)
 */
function clearImprovementTimeout(logId: string): void {
  const timeout = improvementTimeouts.get(logId);
  if (timeout) {
    clearTimeout(timeout);
    improvementTimeouts.delete(logId);
  }
}

interface ImprovementLog {
  id: string;
  timestamp: string;
  task: string;
  reason: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  activities?: BuildActivity[];
  cost?: number;
  autoCommit?: boolean;
  commitSha?: string;
}

async function loadLogs(): Promise<ImprovementLog[]> {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveLogs(logs: ImprovementLog[]): Promise<void> {
  await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
}

async function addLog(log: ImprovementLog): Promise<void> {
  const logs = await loadLogs();
  logs.unshift(log); // Add to beginning
  // Keep only last 50 logs
  if (logs.length > 50) logs.length = 50;
  await saveLogs(logs);
}

async function updateLog(id: string, updates: Partial<ImprovementLog>): Promise<void> {
  const logs = await loadLogs();
  const index = logs.findIndex(l => l.id === id);
  if (index >= 0) {
    logs[index] = { ...logs[index], ...updates };
    await saveLogs(logs);
  }
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, task, reason, toolName, toolDescription, parameters, implementation, autoCommit = true, autoPush = true } = body;

    switch (action) {
      case 'improve': {
        // Rate limiting: Check for concurrent improvements
        const runningCount = getRunningCount();
        if (runningCount >= MAX_CONCURRENT_IMPROVEMENTS) {
          return NextResponse.json({
            success: false,
            error: `Already running ${runningCount} improvement(s). Maximum allowed: ${MAX_CONCURRENT_IMPROVEMENTS}. Please wait for current improvement to complete.`,
            rateLimited: true,
          }, { status: 429 });
        }

        // Rate limiting: Check cooldown
        const timeSinceLastImprovement = Date.now() - lastImprovementStartTime;
        if (timeSinceLastImprovement < COOLDOWN_MS && lastImprovementStartTime > 0) {
          const waitTime = Math.ceil((COOLDOWN_MS - timeSinceLastImprovement) / 1000);
          return NextResponse.json({
            success: false,
            error: `Please wait ${waitTime} seconds before starting another improvement.`,
            rateLimited: true,
            waitTimeSeconds: waitTime,
          }, { status: 429 });
        }

        // Update cooldown timestamp
        lastImprovementStartTime = Date.now();

        // Create a log entry
        const logId = crypto.randomUUID();
        const log: ImprovementLog = {
          id: logId,
          timestamp: new Date().toISOString(),
          task,
          reason,
          status: 'running',
          autoCommit,
        };
        await addLog(log);

        // Initialize active improvement tracking
        setActiveImprovement(logId, {
          activities: [],
          messages: [],
          status: 'running',
        });

        // Build the prompt for Claude Code
        const prompt = `You are improving Albert, a voice-first AI assistant.

TASK: ${task}

REASON: ${reason}

IMPORTANT CONTEXT:
- You are modifying Albert's own codebase (the project you're currently in)
- Albert is built with Next.js, React, TypeScript, and Tailwind CSS
- Key files:
  - app/page.tsx - Main voice interface
  - lib/buildTools.ts - Tool definitions for voice commands
  - app/api/ - API routes
  - components/ - React components
- After making changes, the dev server will hot-reload automatically
- Be careful not to break existing functionality
- Add proper error handling
- Test your changes mentally before committing

Please make the necessary code changes to accomplish this task.`;

        // Activity tracker for real-time updates
        const tracker = new ActivityTracker();

        // Set up timeout for this improvement
        setupImprovementTimeout(logId, async () => {
          const improvement = getActiveImprovement(logId);
          await updateLog(logId, {
            status: 'failed',
            error: `Improvement timed out after ${MAX_IMPROVEMENT_DURATION_MS / 60000} minutes`,
            output: improvement?.messages.join('\n').slice(-2000),
            activities: improvement?.activities,
          });
          updateActiveImprovementStatus(logId, { status: 'failed' });
        });

        // Run Claude Code with the SDK (async - non-blocking)
        runClaudeCode(prompt, {
          cwd: ALBERT_ROOT,
          maxBudgetUsd: 10.0,
          maxTurns: 50,
          onMessage: async (msg: ClaudeCodeMessage) => {
            const improvement = getActiveImprovement(logId);
            if (improvement && msg.content) {
              improvement.messages.push(msg.content);
            }
          },
          onActivity: (activity: BuildActivity) => {
            const improvement = getActiveImprovement(logId);
            if (improvement) {
              const existing = improvement.activities.findIndex(a => a.id === activity.id);
              if (existing >= 0) {
                improvement.activities[existing] = activity;
              } else {
                improvement.activities.push(activity);
              }
            }
          },
          activityTracker: tracker,
        }).then(async (result) => {
          // Clear timeout since we completed
          clearImprovementTimeout(logId);

          const improvement = getActiveImprovement(logId);

          if (result.success) {
            let commitSha: string | undefined;

            // Auto-commit if enabled (auto-push is true by default)
            if (autoCommit) {
              const commitResult = await autoCommitSelfImprovement(task, autoPush);
              if (commitResult.success) {
                commitSha = commitResult.sha;
              }
            }

            await updateLog(logId, {
              status: 'completed',
              output: improvement?.messages.join('\n').slice(-2000),
              activities: improvement?.activities,
              cost: result.cost,
              commitSha,
            });

            updateActiveImprovementStatus(logId, { status: 'completed' });
          } else {
            await updateLog(logId, {
              status: 'failed',
              output: improvement?.messages.join('\n').slice(-2000),
              error: result.error,
              activities: improvement?.activities,
              cost: result.cost,
            });

            updateActiveImprovementStatus(logId, { status: 'failed' });
          }
        }).catch(async (error) => {
          // Clear timeout since we failed
          clearImprovementTimeout(logId);

          await updateLog(logId, {
            status: 'failed',
            error: error.message,
          });

          updateActiveImprovementStatus(logId, { status: 'failed' });
        });

        return NextResponse.json({
          success: true,
          message: `Self-improvement task started! Albert is using Claude Code to: ${task}`,
          logId,
          note: 'Changes will be applied automatically. The dev server will hot-reload.',
          streamUrl: `/api/self-improve/${logId}/stream`,
        });
      }

      case 'add_tool': {
        // Rate limiting: Check for concurrent improvements
        const runningCountTool = getRunningCount();
        if (runningCountTool >= MAX_CONCURRENT_IMPROVEMENTS) {
          return NextResponse.json({
            success: false,
            error: `Already running ${runningCountTool} improvement(s). Maximum allowed: ${MAX_CONCURRENT_IMPROVEMENTS}. Please wait for current improvement to complete.`,
            rateLimited: true,
          }, { status: 429 });
        }

        // Rate limiting: Check cooldown
        const timeSinceLastTool = Date.now() - lastImprovementStartTime;
        if (timeSinceLastTool < COOLDOWN_MS && lastImprovementStartTime > 0) {
          const waitTimeTool = Math.ceil((COOLDOWN_MS - timeSinceLastTool) / 1000);
          return NextResponse.json({
            success: false,
            error: `Please wait ${waitTimeTool} seconds before starting another improvement.`,
            rateLimited: true,
            waitTimeSeconds: waitTimeTool,
          }, { status: 429 });
        }

        // Update cooldown timestamp
        lastImprovementStartTime = Date.now();

        // Create a log entry
        const logId = crypto.randomUUID();
        const log: ImprovementLog = {
          id: logId,
          timestamp: new Date().toISOString(),
          task: `Add new tool: ${toolName}`,
          reason: toolDescription,
          status: 'running',
          autoCommit,
        };
        await addLog(log);

        // Initialize active improvement tracking
        setActiveImprovement(logId, {
          activities: [],
          messages: [],
          status: 'running',
        });

        // Build the prompt for Claude Code
        const prompt = `You are adding a new tool to Albert, a voice-first AI assistant.

NEW TOOL TO ADD:
- Name: ${toolName}
- Description: ${toolDescription}
- Parameters: ${parameters || 'None specified'}
- Implementation: ${implementation}

TASKS:
1. Add the tool definition to lib/buildTools.ts (follow the existing pattern)
2. Create any necessary API routes in app/api/
3. Add the handler in app/page.tsx in the executeFunctionCall switch statement
4. Make sure to handle errors gracefully

IMPORTANT:
- Follow the existing code patterns
- Add proper TypeScript types
- Test your changes mentally before committing
- The dev server will hot-reload automatically

Please implement this new tool.`;

        // Activity tracker for real-time updates
        const tracker = new ActivityTracker();

        // Set up timeout for this improvement
        setupImprovementTimeout(logId, async () => {
          const improvement = getActiveImprovement(logId);
          await updateLog(logId, {
            status: 'failed',
            error: `Improvement timed out after ${MAX_IMPROVEMENT_DURATION_MS / 60000} minutes`,
            output: improvement?.messages.join('\n').slice(-2000),
            activities: improvement?.activities,
          });
          updateActiveImprovementStatus(logId, { status: 'failed' });
        });

        // Run Claude Code with the SDK
        runClaudeCode(prompt, {
          cwd: ALBERT_ROOT,
          maxBudgetUsd: 10.0,
          maxTurns: 50,
          onMessage: async (msg: ClaudeCodeMessage) => {
            const improvement = getActiveImprovement(logId);
            if (improvement && msg.content) {
              improvement.messages.push(msg.content);
            }
          },
          onActivity: (activity: BuildActivity) => {
            const improvement = getActiveImprovement(logId);
            if (improvement) {
              const existing = improvement.activities.findIndex(a => a.id === activity.id);
              if (existing >= 0) {
                improvement.activities[existing] = activity;
              } else {
                improvement.activities.push(activity);
              }
            }
          },
          activityTracker: tracker,
        }).then(async (result) => {
          // Clear timeout since we completed
          clearImprovementTimeout(logId);

          const improvement = getActiveImprovement(logId);

          if (result.success) {
            let commitSha: string | undefined;

            // Auto-commit if enabled
            if (autoCommit) {
              const commitResult = await autoCommitSelfImprovement(`Add tool: ${toolName}`, autoPush);
              if (commitResult.success) {
                commitSha = commitResult.sha;
              }
            }

            await updateLog(logId, {
              status: 'completed',
              output: improvement?.messages.join('\n').slice(-2000),
              activities: improvement?.activities,
              cost: result.cost,
              commitSha,
            });

            updateActiveImprovementStatus(logId, { status: 'completed' });
          } else {
            await updateLog(logId, {
              status: 'failed',
              output: improvement?.messages.join('\n').slice(-2000),
              error: result.error,
              activities: improvement?.activities,
              cost: result.cost,
            });

            updateActiveImprovementStatus(logId, { status: 'failed' });
          }
        }).catch(async (error) => {
          // Clear timeout since we failed
          clearImprovementTimeout(logId);

          await updateLog(logId, {
            status: 'failed',
            error: error.message,
          });

          updateActiveImprovementStatus(logId, { status: 'failed' });
        });

        return NextResponse.json({
          success: true,
          message: `Adding new tool "${toolName}"! Claude Code is implementing it now.`,
          logId,
          streamUrl: `/api/self-improve/${logId}/stream`,
        });
      }

      case 'status': {
        const logs = await loadLogs();
        const recent = logs.slice(0, 10);
        return NextResponse.json({
          success: true,
          recentImprovements: recent,
        });
      }

      case 'check': {
        const { logId } = body;

        // Check active improvements first
        const activeImprovement = getActiveImprovement(logId);
        if (activeImprovement) {
          return NextResponse.json({
            success: true,
            improvement: {
              id: logId,
              status: activeImprovement.status,
              activities: activeImprovement.activities,
              messages: activeImprovement.messages.slice(-10),
            },
            isActive: true,
          });
        }

        // Fall back to log file
        const logs = await loadLogs();
        const log = logs.find(l => l.id === logId);
        if (log) {
          return NextResponse.json({
            success: true,
            improvement: log,
            isActive: false,
          });
        } else {
          return NextResponse.json({
            success: false,
            error: 'Log not found',
          });
        }
      }

      case 'commit': {
        // Manually trigger a commit (push to GitHub by default)
        const { message, push = true } = body;
        const result = await autoCommitSelfImprovement(message || 'Manual self-improvement commit', push);
        return NextResponse.json({
          success: result.success,
          sha: result.sha,
          error: result.error,
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Self-Improve API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Self-improvement failed',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const logs = await loadLogs();

    // Also include active improvements
    const activeIds = getAllActiveImprovementIds();
    const activeDetails = activeIds.map(id => {
      const improvement = getActiveImprovement(id);
      return {
        id,
        status: improvement?.status,
        activityCount: improvement?.activities.length || 0,
        messageCount: improvement?.messages.length || 0,
      };
    });

    return NextResponse.json({
      success: true,
      totalImprovements: logs.length,
      completed: logs.filter(l => l.status === 'completed').length,
      failed: logs.filter(l => l.status === 'failed').length,
      running: logs.filter(l => l.status === 'running').length,
      recentLogs: logs.slice(0, 10),
      activeImprovements: activeDetails,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get logs',
    }, { status: 500 });
  }
}
