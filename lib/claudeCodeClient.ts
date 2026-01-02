/**
 * Claude Code Client - Wrapper around the Claude Agent SDK
 * Provides a clean interface for running Claude Code sessions programmatically.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { BuildStatus, ProjectType } from '@/types/build';

export interface ClaudeCodeMessage {
  type: 'system' | 'assistant' | 'stream_event' | 'result';
  content?: string;
  event?: string;
  result?: string;
  cost?: number;
  error?: string;
}

export interface ClaudeCodeOptions {
  cwd: string;
  tools?: string[];
  maxBudgetUsd?: number;
  maxTurns?: number;
  onMessage?: (message: ClaudeCodeMessage) => void;
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

## Process
1. First, plan the project structure and key components
2. Create the project files directly in the current directory (NO subdirectories for project root)
3. Install dependencies with npm install
4. Test that the project runs correctly
5. Fix any issues you find

Begin building the project now.`;
}

/**
 * Run Claude Code with a prompt and stream results
 */
export async function runClaudeCode(
  prompt: string,
  options: ClaudeCodeOptions
): Promise<{ success: boolean; result?: string; error?: string; cost?: number }> {
  try {
    let finalResult: string | undefined;
    let totalCost: number | undefined;
    let hasError = false;
    let errorMessage: string | undefined;

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
      },
    });

    for await (const message of result) {
      switch (message.type) {
        case 'system':
          options.onMessage?.({
            type: 'system',
            content: `Session initialized: ${message.session_id}`,
          });
          break;

        case 'stream_event':
          options.onMessage?.({
            type: 'stream_event',
            event: JSON.stringify(message.event),
          });
          break;

        case 'assistant':
          // Extract text content from the message
          const content = message.message?.content;
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
          if (message.subtype === 'success') {
            finalResult = message.result;
            totalCost = message.total_cost_usd;
            options.onMessage?.({
              type: 'result',
              result: message.result,
              cost: message.total_cost_usd,
            });
          } else if (message.subtype?.startsWith('error')) {
            hasError = true;
            errorMessage = (message as { error?: string }).error || `Error: ${message.subtype}`;
            options.onMessage?.({
              type: 'result',
              error: errorMessage,
            });
          }
          break;
      }
    }

    if (hasError) {
      return { success: false, error: errorMessage, cost: totalCost };
    }

    return { success: true, result: finalResult, cost: totalCost };
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
 * Build a project using Claude Code
 */
export async function buildProject(
  description: string,
  projectType: ProjectType,
  workspacePath: string,
  options: {
    preferredStack?: string;
    onMessage?: (message: ClaudeCodeMessage) => void;
    maxBudgetUsd?: number;
    buildContext?: string; // Past patterns, preferences, and lessons learned
  } = {}
): Promise<{ success: boolean; error?: string; cost?: number; prompt?: string }> {
  const prompt = generateBuildPrompt(
    description,
    projectType,
    options.preferredStack,
    options.buildContext
  );

  const result = await runClaudeCode(prompt, {
    cwd: workspacePath,
    onMessage: options.onMessage,
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
    maxBudgetUsd?: number;
  } = {}
): Promise<{ success: boolean; error?: string; cost?: number }> {
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
  } = {}
): Promise<{ success: boolean; error?: string }> {
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
    maxBudgetUsd: 2.0,
    maxTurns: 20,
  });
}
