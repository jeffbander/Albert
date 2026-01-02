/**
 * OpenAI Function Tool definitions for Albert's building capabilities.
 * These tools are added to the Realtime API session to enable voice-activated builds.
 */

export interface OpenAITool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Tool definitions for build operations
 */
export const BUILD_TOOLS: OpenAITool[] = [
  {
    type: 'function',
    name: 'start_build_project',
    description: 'Start building a new software project. Use this when the user asks you to create, build, or make an application, website, API, or any software project. Albert will use Claude Code to autonomously build the project.',
    parameters: {
      type: 'object',
      properties: {
        projectDescription: {
          type: 'string',
          description: 'A detailed description of what to build. Include features, technologies, and any specific requirements the user mentioned.',
        },
        projectType: {
          type: 'string',
          enum: ['web-app', 'api', 'cli', 'library', 'full-stack'],
          description: 'The type of project to create. web-app for frontend apps, api for backend services, cli for command-line tools, library for reusable packages, full-stack for apps with both frontend and backend.',
        },
        preferredStack: {
          type: 'string',
          description: 'Optional technology preferences mentioned by the user (e.g., "React, TypeScript, Tailwind", "Python FastAPI", "Node.js Express").',
        },
        deployTarget: {
          type: 'string',
          enum: ['localhost', 'vercel'],
          description: 'Where to deploy the project. Use localhost for local preview (default), or vercel for production deployment.',
        },
      },
      required: ['projectDescription', 'projectType'],
    },
  },
  {
    type: 'function',
    name: 'check_build_status',
    description: 'Check the current status of a build project. Use this when the user asks about the progress of their build, or wants to know if a project is done.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to check. If not provided, checks the most recent project.',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'modify_project',
    description: 'Request changes or additions to an existing project. Use when the user wants to update, add features to, or fix something in a project that was already built.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to modify.',
        },
        changeDescription: {
          type: 'string',
          description: 'A detailed description of the changes to make. Include what to add, modify, or fix.',
        },
      },
      required: ['projectId', 'changeDescription'],
    },
  },
  {
    type: 'function',
    name: 'list_projects',
    description: 'List all build projects. Use when the user asks what projects exist or wants to see their project history.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'string',
          description: 'Maximum number of projects to return. Default is 10.',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'deploy_project',
    description: 'Deploy a project to Vercel. Use when the user wants to put their project online or make it accessible to others.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to deploy.',
        },
        production: {
          type: 'string',
          description: 'Set to "true" to deploy to production. Default is preview deployment.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    type: 'function',
    name: 'push_to_github',
    description: 'Push a built project to GitHub. Use when the user wants to save their project to GitHub, or asks to commit/push the code.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to push.',
        },
        owner: {
          type: 'string',
          description: 'The GitHub username or organization that owns the repo. Default is the authenticated user.',
        },
        repo: {
          type: 'string',
          description: 'The name of the GitHub repository to push to.',
        },
        commitMessage: {
          type: 'string',
          description: 'Optional commit message for the push.',
        },
      },
      required: ['projectId', 'repo'],
    },
  },
  {
    type: 'function',
    name: 'cancel_build',
    description: 'Cancel a running build. Use when the user wants to stop a build in progress.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to cancel. If not provided, cancels the most recent running build.',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'retry_build',
    description: 'Retry a failed build. Use when a build failed and the user wants to try again, possibly with modifications.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the failed project to retry.',
        },
        modifications: {
          type: 'string',
          description: 'Optional modifications to make before retrying (e.g., "use simpler approach", "skip animations").',
        },
      },
      required: ['projectId'],
    },
  },
  {
    type: 'function',
    name: 'open_project',
    description: 'Open a built project in the browser. Use when the user wants to see or preview a completed project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to open. If not provided, opens the most recent completed project.',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'describe_project',
    description: 'Get a detailed description of what was built in a project. Use when the user asks what a project contains or what features it has.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to describe.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    type: 'function',
    name: 'respond_to_build',
    description: 'Send a response to a build that is waiting for clarification. Use this when Claude Code asks a question during the build process and the user provides an answer.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project that is waiting for a response.',
        },
        response: {
          type: 'string',
          description: 'The user\'s response to the clarification question.',
        },
      },
      required: ['projectId', 'response'],
    },
  },
  {
    type: 'function',
    name: 'get_pending_question',
    description: 'Check if there is a pending question from the build that needs the user\'s input. Use this when you need to check if the build is waiting for clarification.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to check for pending questions. If not provided, checks all active builds.',
        },
      },
      required: [],
    },
  },
];

/**
 * Get all build tools for the session configuration
 */
export function getBuildTools(): OpenAITool[] {
  return BUILD_TOOLS;
}

/**
 * Check if a tool name is a build-related tool
 */
export function isBuildTool(toolName: string): boolean {
  return BUILD_TOOLS.some(tool => tool.name === toolName);
}

/**
 * Get a specific tool definition by name
 */
export function getBuildTool(toolName: string): OpenAITool | undefined {
  return BUILD_TOOLS.find(tool => tool.name === toolName);
}
