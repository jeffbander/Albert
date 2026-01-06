/**
 * Claude Code Client - Wrapper around the Claude Agent SDK
 * Provides a clean interface for running Claude Code sessions programmatically.
 * Enhanced with real-time activity tracking for fine control over builds.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { BuildStatus, ProjectType } from '@/types/build';
import {
  type BuildActivity,
  parseStreamEvent,
  updateActivityWithInput,
  completeActivity,
  ActivityTracker,
} from './buildActivityParser';

export interface ClaudeCodeMessage {
  type: 'system' | 'assistant' | 'stream_event' | 'result' | 'activity';
  content?: string;
  event?: string;
  result?: string;
  cost?: number;
  error?: string;
  activity?: BuildActivity;
}

export interface ClaudeCodeOptions {
  cwd: string;
  tools?: string[];
  maxBudgetUsd?: number;
  maxTurns?: number;
  onMessage?: (message: ClaudeCodeMessage) => void;
  onActivity?: (activity: BuildActivity) => void;
  activityTracker?: ActivityTracker;
}

/**
 * Default tools allowed for building projects
 */
const DEFAULT_BUILD_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
];

/**
 * MCP Servers configuration for extended capabilities
 * Playwright gives Albert browser automation abilities
 * Gmail gives Albert email capabilities (send, read, search, draft)
 */
const MCP_SERVERS = {
  playwright: {
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-playwright'],
  },
  gmail: {
    command: 'npx',
    args: ['@gongrzhe/server-gmail-autoauth-mcp'],
  },
};

/**
 * Generate a system prompt for building a specific type of project
 */
export function generateBuildPrompt(
  description: string,
  projectType: ProjectType,
  preferredStack?: string,
  buildContext?: string
): string {
  const stackHint = preferredStack
    ? `The user prefers: ${preferredStack}. Use these technologies if appropriate.`
    : '';

  const typeGuidelines: Record<ProjectType, string> = {
    'web-app': 'Create a modern web application with a clean UI. Use React/Next.js or Vue unless specified otherwise. Include proper styling (Tailwind CSS recommended) and responsive design.',
    'api': 'Create a RESTful or GraphQL API. Use Node.js/Express, Python/FastAPI, or similar. Include proper error handling, validation, and documentation.',
    'cli': 'Create a command-line tool. Use Node.js, Python, or Go. Include help text, argument parsing, and useful output formatting.',
    'library': 'Create a reusable library/package. Include TypeScript types, documentation, and example usage. Structure for npm/PyPI publishing.',
    'full-stack': 'Create a full-stack application with both frontend and backend. Use Next.js with API routes, or separate frontend/backend. Include database setup if needed.',
  };

  // Include build context if available (past patterns, preferences, lessons learned)
  const contextSection = buildContext && buildContext !== 'No prior build context available.'
    ? `
## Build Context (from past experience)
${buildContext}

Use this context to inform your decisions - follow patterns that worked well, avoid past mistakes, and respect user preferences.
`
    : '';

  return `You are building a software project autonomously. Follow these guidelines:

## Project Description
${description}

## Project Type
${typeGuidelines[projectType]}

${stackHint}
${contextSection}
## CRITICAL: File Location
**Create ALL project files directly in the CURRENT WORKING DIRECTORY.**
- Do NOT create a subdirectory for the project (no "my-app/" or "project-name/" folder)
- Put package.json, README.md, src/, etc. directly in the current directory
- The current directory IS your project root

## Guidelines
1. Create a complete, working project - not just scaffolding
2. Include a README.md with setup and run instructions
3. Add proper error handling and edge cases
4. Use TypeScript for JavaScript projects when possible
5. Include a package.json or equivalent with all dependencies
6. Create a .gitignore file
7. Make the project production-ready

## Browser Automation (Playwright)
You have access to Playwright for browser automation. You can:
- Navigate to web pages
- Click buttons and fill forms
- Take screenshots of your work
- Read page content and console logs
- Test the UI of apps you build
Use these capabilities to verify your builds work correctly in a real browser.

## Process
1. First, plan the project structure and key components
2. Create the project files directly in the current directory (NO subdirectories for project root)
3. Install dependencies with npm install
4. Test that the project runs correctly
5. Use Playwright to verify the UI works in a browser
6. Fix any issues you find

Begin building the project now.`;
}

// Track active queries for pause/resume capability
const activeQueries = new Map<string, { query: AsyncIterable<unknown>; sessionId?: string }>();

/**
 * Run Claude Code with a prompt and stream results
 * Now includes real-time activity tracking for fine control
 */
export async function runClaudeCode(
  prompt: string,
  options: ClaudeCodeOptions
): Promise<{ success: boolean; result?: string; error?: string; cost?: number; sessionId?: string }> {
  try {
    let finalResult: string | undefined;
    let totalCost: number | undefined;
    let hasError = false;
    let errorMessage: string | undefined;
    let sessionId: string | undefined;

    // Activity tracking state
    const tracker = options.activityTracker || new ActivityTracker();
    const pendingActivities = new Map<string, BuildActivity>();
    let currentToolUseId: string | undefined;
    let currentToolInput: Record<string, unknown> = {};

    const toolsToUse = options.tools || DEFAULT_BUILD_TOOLS;
    const result = query({
      prompt,
      options: {
        cwd: options.cwd,
        tools: toolsToUse,
        allowedTools: toolsToUse, // Auto-allow these tools without prompting
        permissionMode: 'acceptEdits', // Auto-accept file edits
        maxBudgetUsd: options.maxBudgetUsd || 15.0,
        maxTurns: options.maxTurns || 100,
        includePartialMessages: true,
        mcpServers: MCP_SERVERS, // Enable Playwright for browser automation
      },
    });

    for await (const message of result) {
      switch (message.type) {
        case 'system':
          sessionId = (message as { session_id?: string }).session_id;
          if (sessionId) {
            activeQueries.set(sessionId, { query: result, sessionId });
          }
          options.onMessage?.({
            type: 'system',
            content: `Session initialized: ${sessionId}`,
          });
          break;

        case 'stream_event':
          // Parse the stream event for activity tracking
          const event = (message as { event?: unknown }).event;
          if (event) {
            const activity = parseStreamEvent(event);
            if (activity) {
              // Track the activity
              if (activity.type !== 'complete') {
                pendingActivities.set(activity.id, activity);
                currentToolUseId = activity.id;
                currentToolInput = {};
              }

              tracker.upsert(activity);
              options.onActivity?.(activity);
              options.onMessage?.({
                type: 'activity',
                activity,
              });
            }

            // Handle tool input accumulation
            const evt = event as Record<string, unknown>;
            if (evt.type === 'content_block_delta') {
              const delta = evt.delta as Record<string, unknown> | undefined;
              if (delta?.type === 'input_json_delta' && currentToolUseId) {
                // Accumulate partial JSON input
                const partialJson = delta.partial_json as string;
                if (partialJson) {
                  try {
                    // Try to parse accumulated input
                    Object.assign(currentToolInput, JSON.parse(partialJson));
                    const pendingActivity = pendingActivities.get(currentToolUseId);
                    if (pendingActivity) {
                      const updated = updateActivityWithInput(pendingActivity, currentToolInput);
                      pendingActivities.set(currentToolUseId, updated);
                      tracker.upsert(updated);
                      options.onActivity?.(updated);
                    }
                  } catch {
                    // Partial JSON, ignore parse errors
                  }
                }
              }
            }

            // Handle tool completion
            if (evt.type === 'content_block_stop' && currentToolUseId) {
              const pendingActivity = pendingActivities.get(currentToolUseId);
              if (pendingActivity) {
                const completed = completeActivity(pendingActivity, true);
                pendingActivities.delete(currentToolUseId);
                tracker.upsert(completed);
                options.onActivity?.(completed);
              }
              currentToolUseId = undefined;
              currentToolInput = {};
            }
          }

          options.onMessage?.({
            type: 'stream_event',
            event: JSON.stringify(event),
          });
          break;

        case 'assistant':
          // Extract text content from the message
          const content = (message as { message?: { content?: unknown } }).message?.content;
          if (content) {
            const textContent = Array.isArray(content)
              ? content
                  .filter((c: unknown) => (c as { type?: string })?.type === 'text')
                  .map((c: unknown) => (c as { text?: string })?.text || '')
                  .join('\n')
              : String(content);

            options.onMessage?.({
              type: 'assistant',
              content: textContent,
            });
          }
          break;

        case 'result':
          const resultMessage = message as { subtype?: string; result?: string; total_cost_usd?: number; error?: string };
          if (resultMessage.subtype === 'success') {
            finalResult = resultMessage.result;
            totalCost = resultMessage.total_cost_usd;
            options.onMessage?.({
              type: 'result',
              result: resultMessage.result,
              cost: resultMessage.total_cost_usd,
            });
          } else if (resultMessage.subtype?.startsWith('error')) {
            hasError = true;
            errorMessage = resultMessage.error || `Error: ${resultMessage.subtype}`;
            options.onMessage?.({
              type: 'result',
              error: errorMessage,
            });
          }
          break;
      }
    }

    // Clean up active query
    if (sessionId) {
      activeQueries.delete(sessionId);
    }

    if (hasError) {
      return { success: false, error: errorMessage, cost: totalCost, sessionId };
    }

    return { success: true, result: finalResult, cost: totalCost, sessionId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    options.onMessage?.({
      type: 'result',
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get list of active sessions
 */
export function getActiveSessions(): string[] {
  return Array.from(activeQueries.keys());
}

/**
 * Build a project using Claude Code
 * Enhanced with activity tracking for real-time visibility
 */
export async function buildProject(
  description: string,
  projectType: ProjectType,
  workspacePath: string,
  options: {
    preferredStack?: string;
    onMessage?: (message: ClaudeCodeMessage) => void;
    onActivity?: (activity: BuildActivity) => void;
    activityTracker?: ActivityTracker;
    maxBudgetUsd?: number;
    buildContext?: string; // Past patterns, preferences, and lessons learned
  } = {}
): Promise<{ success: boolean; error?: string; cost?: number; prompt?: string; sessionId?: string }> {
  const prompt = generateBuildPrompt(
    description,
    projectType,
    options.preferredStack,
    options.buildContext
  );

  const result = await runClaudeCode(prompt, {
    cwd: workspacePath,
    onMessage: options.onMessage,
    onActivity: options.onActivity,
    activityTracker: options.activityTracker,
    maxBudgetUsd: options.maxBudgetUsd || 10.0,
  });

  // Return the prompt along with the result so it can be saved
  return { ...result, prompt };
}

/**
 * Modify an existing project using Claude Code
 */
export async function modifyProject(
  changeDescription: string,
  workspacePath: string,
  options: {
    onMessage?: (message: ClaudeCodeMessage) => void;
    onActivity?: (activity: BuildActivity) => void;
    activityTracker?: ActivityTracker;
    maxBudgetUsd?: number;
  } = {}
): Promise<{ success: boolean; error?: string; cost?: number; sessionId?: string }> {
  const prompt = `You are modifying an existing project. The project is already set up in this directory.

## Requested Changes
${changeDescription}

## Guidelines
1. First, understand the existing project structure
2. Make the requested changes carefully
3. Ensure changes are consistent with existing code style
4. Test that the project still works after changes
5. Update documentation if needed

Begin making the changes now.`;

  return runClaudeCode(prompt, {
    cwd: workspacePath,
    onMessage: options.onMessage,
    onActivity: options.onActivity,
    activityTracker: options.activityTracker,
    maxBudgetUsd: options.maxBudgetUsd || 5.0,
  });
}

/**
 * Test a project using Claude Code
 */
export async function testProject(
  workspacePath: string,
  options: {
    onMessage?: (message: ClaudeCodeMessage) => void;
    onActivity?: (activity: BuildActivity) => void;
    activityTracker?: ActivityTracker;
  } = {}
): Promise<{ success: boolean; error?: string; sessionId?: string }> {
  const prompt = `You are testing an existing project to ensure it works correctly.

IMPORTANT: The project is in YOUR CURRENT WORKING DIRECTORY. Do NOT navigate elsewhere.
Start by running "ls" or "dir" to see the project files right here.

## Tasks
1. List files in current directory to see the project structure
2. Check package.json for dependencies and scripts
3. Run "npm run build" or equivalent to verify it compiles
4. Start the dev server if applicable (npm run dev)
5. Report any issues found

Do NOT search for projects elsewhere. The project files are HERE in your current directory.`;

  return runClaudeCode(prompt, {
    cwd: workspacePath,
    onMessage: options.onMessage,
    onActivity: options.onActivity,
    activityTracker: options.activityTracker,
    maxBudgetUsd: 2.0,
    maxTurns: 20,
  });
}

// Re-export types and utilities for consumers
export { type BuildActivity, ActivityTracker, getActivityTracker } from './buildActivityParser';
