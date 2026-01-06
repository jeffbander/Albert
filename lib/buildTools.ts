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
  // Browser control tools
  {
    type: 'function',
    name: 'open_browser',
    description: 'Open a website or URL in the browser using Playwright. Use this when the user asks you to open a website, go to a URL, navigate to a page, or visit a site. Examples: "open CNN", "go to google.com", "show me YouTube".',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to open. Can be a full URL (https://cnn.com) or just a domain (cnn.com). Common sites can be just the name (e.g., "google", "youtube", "twitter").',
        },
      },
      required: ['url'],
    },
  },
  {
    type: 'function',
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current browser page. Use this when the user asks to see what\'s on the page, wants you to read or describe the page, or asks "what do you see".',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'browser_click',
    description: 'Click on an element on the current page. Use this when the user asks you to click a button, link, or any interactive element.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or text content to click. Examples: "button.submit", "text=Sign In", "a[href=\'/about\']".',
        },
      },
      required: ['selector'],
    },
  },
  {
    type: 'function',
    name: 'browser_type',
    description: 'Type text into an input field on the current page. Use this when the user asks you to type, enter text, fill in a form, or search for something.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input field. Examples: "input[name=\'search\']", "#email", "textarea".',
        },
        text: {
          type: 'string',
          description: 'The text to type into the field.',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    type: 'function',
    name: 'browser_scroll',
    description: 'Scroll the current page up or down. Use this when the user asks to scroll, see more, or navigate up/down the page.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Direction to scroll.',
        },
        amount: {
          type: 'string',
          description: 'How much to scroll. Options: "page" for one page, "half" for half page, or a number of pixels.',
        },
      },
      required: ['direction'],
    },
  },
  {
    type: 'function',
    name: 'close_browser',
    description: 'Close the browser. Use this when the user asks to close the browser or is done browsing.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_page_content',
    description: 'Get the text content of the current browser page. Use this when you need to read or understand what is on the current web page.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // Self-improvement tools - Albert can read his own source code
  {
    type: 'function',
    name: 'read_my_code',
    description: 'Read Albert\'s own source code files. Use this when the user asks you to look at your own code, improve yourself, understand how you work, or suggest enhancements to your capabilities.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The file path to read relative to the project. Examples: "app/page.tsx" (main UI), "lib/buildTools.ts" (tools definitions), "components/AlbertChatWindow.tsx" (chat window), "lib/prompts.ts" (system prompts).',
        },
      },
      required: ['filePath'],
    },
  },
  {
    type: 'function',
    name: 'list_my_files',
    description: 'List Albert\'s source code files. Use this to see what files make up your codebase so you can read and understand them.',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory to list. Examples: "app" (pages and API routes), "lib" (utilities and logic), "components" (UI components), "hooks" (React hooks). Leave empty for project root.',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'suggest_improvement',
    description: 'Suggest an improvement to Albert\'s own code. Use this when the user asks you to improve yourself or you identify a way to enhance your capabilities.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The file to modify.',
        },
        description: {
          type: 'string',
          description: 'Description of the improvement to make.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level of the improvement.',
        },
      },
      required: ['filePath', 'description'],
    },
  },
  {
    type: 'function',
    name: 'improve_myself',
    description: 'Use Claude Code to actually modify and improve Albert\'s own code. This is the self-improvement capability - use it when the user asks you to fix yourself, add a new feature to yourself, or improve your capabilities. Claude Code will make the actual code changes.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'A detailed description of what to fix, improve, or add. Be specific about what files to modify and what changes to make.',
        },
        reason: {
          type: 'string',
          description: 'Why this improvement is needed - what problem it solves or what capability it adds.',
        },
      },
      required: ['task', 'reason'],
    },
  },
  {
    type: 'function',
    name: 'add_new_tool',
    description: 'Add a completely new tool/capability to Albert. Use this when the user asks you to give yourself a new ability or add a new feature that requires a new tool definition.',
    parameters: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'The name of the new tool (snake_case, e.g., "send_email", "play_music").',
        },
        toolDescription: {
          type: 'string',
          description: 'What the tool does and when to use it.',
        },
        parameters: {
          type: 'string',
          description: 'JSON description of the parameters the tool needs.',
        },
        implementation: {
          type: 'string',
          description: 'Description of how the tool should work - what API to call, what logic to implement.',
        },
      },
      required: ['toolName', 'toolDescription', 'implementation'],
    },
  },
  // Build tools
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
  {
    type: 'function',
    name: 'read_project_file',
    description: 'Read the contents of a specific file from a build project. Use this when you need to understand what was created, check the code, or answer questions about specific files in a project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project containing the file.',
        },
        filePath: {
          type: 'string',
          description: 'The relative path to the file within the project (e.g., "src/App.tsx", "package.json").',
        },
      },
      required: ['projectId', 'filePath'],
    },
  },
  {
    type: 'function',
    name: 'list_project_files',
    description: 'List all files in a build project. Use this to see what files exist in a project, understand the project structure, or before reading specific files.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to list files for.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    type: 'function',
    name: 'guide_build',
    description: 'Give Claude Code specific guidance during an active build. Use this when you see something going wrong, want to redirect the approach, or need to provide additional context mid-build.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project currently being built.',
        },
        guidance: {
          type: 'string',
          description: 'Specific instructions or guidance for Claude Code to follow.',
        },
        action: {
          type: 'string',
          enum: ['continue', 'pause', 'restart_step'],
          description: 'What action to take. continue: apply guidance and keep building, pause: stop for review, restart_step: redo the current step with guidance.',
        },
      },
      required: ['projectId', 'guidance', 'action'],
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
