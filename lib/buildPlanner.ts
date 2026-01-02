/**
 * Build Planner - Generates structured build plans before execution
 * Implements Plan-then-Act pattern for fine control over builds.
 */

import type { ProjectType } from '@/types/build';

export interface BuildPlanStep {
  order: number;
  action: string;
  files: string[];
  reasoning: string;
  estimatedTime?: string;
  status: 'pending' | 'active' | 'complete' | 'skipped' | 'failed';
}

export interface BuildPlan {
  id: string;
  projectId?: string;
  description: string;
  projectType: ProjectType;
  steps: BuildPlanStep[];
  estimatedFiles: string[];
  estimatedDependencies: string[];
  techStack: string[];
  risks: string[];
  status: 'draft' | 'approved' | 'executing' | 'complete' | 'failed';
  createdAt: Date;
  approvedAt?: Date;
}

/**
 * Generate a build plan based on project description and type
 */
export function generateBuildPlan(
  description: string,
  projectType: ProjectType,
  preferredStack?: string
): BuildPlan {
  const id = crypto.randomUUID();
  const techStack = inferTechStack(projectType, preferredStack);
  const steps = generateSteps(projectType, techStack);
  const estimatedFiles = estimateFiles(projectType, techStack);
  const estimatedDependencies = estimateDependencies(projectType, techStack);
  const risks = identifyRisks(description, projectType);

  return {
    id,
    description,
    projectType,
    steps,
    estimatedFiles,
    estimatedDependencies,
    techStack,
    risks,
    status: 'draft',
    createdAt: new Date(),
  };
}

/**
 * Infer technology stack based on project type and preferences
 */
function inferTechStack(projectType: ProjectType, preferredStack?: string): string[] {
  const baseStack: Record<ProjectType, string[]> = {
    'web-app': ['React', 'TypeScript', 'Tailwind CSS', 'Vite'],
    'api': ['Node.js', 'Express', 'TypeScript'],
    'cli': ['Node.js', 'TypeScript', 'Commander.js'],
    'library': ['TypeScript', 'Rollup'],
    'full-stack': ['Next.js', 'TypeScript', 'Tailwind CSS', 'Prisma'],
  };

  const stack = [...baseStack[projectType]];

  // Parse preferred stack if provided
  if (preferredStack) {
    const prefs = preferredStack.split(/[,\s]+/).filter(Boolean);
    for (const pref of prefs) {
      if (!stack.some(s => s.toLowerCase() === pref.toLowerCase())) {
        stack.push(pref);
      }
    }
  }

  return stack;
}

/**
 * Generate build steps based on project type
 */
function generateSteps(projectType: ProjectType, techStack: string[]): BuildPlanStep[] {
  const commonSteps: BuildPlanStep[] = [
    {
      order: 1,
      action: 'Initialize project structure',
      files: ['package.json', 'tsconfig.json', '.gitignore'],
      reasoning: 'Set up the foundation with proper configuration files',
      status: 'pending',
    },
  ];

  const typeSpecificSteps: Record<ProjectType, BuildPlanStep[]> = {
    'web-app': [
      {
        order: 2,
        action: 'Create application entry point',
        files: ['src/main.tsx', 'src/App.tsx', 'index.html'],
        reasoning: 'Set up React application with root component',
        status: 'pending',
      },
      {
        order: 3,
        action: 'Set up styling',
        files: ['src/index.css', 'tailwind.config.js', 'postcss.config.js'],
        reasoning: 'Configure Tailwind CSS for styling',
        status: 'pending',
      },
      {
        order: 4,
        action: 'Build main components',
        files: ['src/components/*.tsx'],
        reasoning: 'Create the core UI components',
        status: 'pending',
      },
      {
        order: 5,
        action: 'Add utilities and helpers',
        files: ['src/utils/*.ts', 'src/hooks/*.ts'],
        reasoning: 'Create reusable utilities and custom hooks',
        status: 'pending',
      },
    ],
    'api': [
      {
        order: 2,
        action: 'Create server entry point',
        files: ['src/index.ts', 'src/app.ts'],
        reasoning: 'Set up Express server with middleware',
        status: 'pending',
      },
      {
        order: 3,
        action: 'Define routes',
        files: ['src/routes/*.ts'],
        reasoning: 'Create API route handlers',
        status: 'pending',
      },
      {
        order: 4,
        action: 'Add middleware and utilities',
        files: ['src/middleware/*.ts', 'src/utils/*.ts'],
        reasoning: 'Add error handling, validation, and helpers',
        status: 'pending',
      },
    ],
    'cli': [
      {
        order: 2,
        action: 'Create CLI entry point',
        files: ['src/index.ts', 'src/cli.ts'],
        reasoning: 'Set up command-line interface with argument parsing',
        status: 'pending',
      },
      {
        order: 3,
        action: 'Define commands',
        files: ['src/commands/*.ts'],
        reasoning: 'Create individual command handlers',
        status: 'pending',
      },
      {
        order: 4,
        action: 'Add utilities',
        files: ['src/utils/*.ts'],
        reasoning: 'Create helper functions for CLI operations',
        status: 'pending',
      },
    ],
    'library': [
      {
        order: 2,
        action: 'Create library entry point',
        files: ['src/index.ts'],
        reasoning: 'Set up main exports',
        status: 'pending',
      },
      {
        order: 3,
        action: 'Implement core functionality',
        files: ['src/lib/*.ts'],
        reasoning: 'Build the core library features',
        status: 'pending',
      },
      {
        order: 4,
        action: 'Add types',
        files: ['src/types.ts'],
        reasoning: 'Define TypeScript interfaces and types',
        status: 'pending',
      },
    ],
    'full-stack': [
      {
        order: 2,
        action: 'Set up Next.js pages',
        files: ['app/page.tsx', 'app/layout.tsx'],
        reasoning: 'Create main application pages',
        status: 'pending',
      },
      {
        order: 3,
        action: 'Create API routes',
        files: ['app/api/**/*.ts'],
        reasoning: 'Build API endpoints',
        status: 'pending',
      },
      {
        order: 4,
        action: 'Build components',
        files: ['components/*.tsx'],
        reasoning: 'Create reusable UI components',
        status: 'pending',
      },
      {
        order: 5,
        action: 'Set up database (if needed)',
        files: ['prisma/schema.prisma', 'lib/db.ts'],
        reasoning: 'Configure database connection and schema',
        status: 'pending',
      },
    ],
  };

  const finalSteps: BuildPlanStep[] = [
    {
      order: 90,
      action: 'Install dependencies',
      files: ['package-lock.json', 'node_modules/'],
      reasoning: 'Install all required npm packages',
      status: 'pending',
    },
    {
      order: 91,
      action: 'Create README',
      files: ['README.md'],
      reasoning: 'Document setup and usage instructions',
      status: 'pending',
    },
    {
      order: 92,
      action: 'Test and verify',
      files: [],
      reasoning: 'Ensure the project builds and runs correctly',
      status: 'pending',
    },
  ];

  // Combine and re-number
  const allSteps = [
    ...commonSteps,
    ...typeSpecificSteps[projectType],
    ...finalSteps,
  ];

  return allSteps.map((step, index) => ({
    ...step,
    order: index + 1,
  }));
}

/**
 * Estimate files that will be created
 */
function estimateFiles(projectType: ProjectType, techStack: string[]): string[] {
  const baseFiles = ['package.json', 'tsconfig.json', '.gitignore', 'README.md'];

  const typeFiles: Record<ProjectType, string[]> = {
    'web-app': [
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/index.css',
      'vite.config.ts',
      'tailwind.config.js',
      'postcss.config.js',
    ],
    'api': [
      'src/index.ts',
      'src/app.ts',
      'src/routes/index.ts',
    ],
    'cli': [
      'src/index.ts',
      'src/cli.ts',
    ],
    'library': [
      'src/index.ts',
      'rollup.config.js',
    ],
    'full-stack': [
      'app/page.tsx',
      'app/layout.tsx',
      'next.config.js',
      'tailwind.config.js',
    ],
  };

  return [...baseFiles, ...typeFiles[projectType]];
}

/**
 * Estimate dependencies
 */
function estimateDependencies(projectType: ProjectType, techStack: string[]): string[] {
  const typeDeps: Record<ProjectType, string[]> = {
    'web-app': ['react', 'react-dom', 'typescript', 'vite', 'tailwindcss', 'postcss', 'autoprefixer'],
    'api': ['express', 'typescript', 'ts-node', '@types/express'],
    'cli': ['commander', 'typescript', 'chalk'],
    'library': ['typescript', 'rollup', '@rollup/plugin-typescript'],
    'full-stack': ['next', 'react', 'react-dom', 'typescript', 'tailwindcss'],
  };

  return typeDeps[projectType];
}

/**
 * Identify potential risks
 */
function identifyRisks(description: string, projectType: ProjectType): string[] {
  const risks: string[] = [];
  const descLower = description.toLowerCase();

  // Check for external API dependencies
  if (descLower.includes('api') || descLower.includes('fetch') || descLower.includes('weather')) {
    risks.push('External API dependency - may need API key or rate limiting handling');
  }

  // Check for authentication
  if (descLower.includes('auth') || descLower.includes('login') || descLower.includes('user')) {
    risks.push('Authentication complexity - ensure secure token handling');
  }

  // Check for database
  if (descLower.includes('database') || descLower.includes('store') || descLower.includes('persist')) {
    risks.push('Database setup required - may need additional configuration');
  }

  // Check for real-time features
  if (descLower.includes('real-time') || descLower.includes('websocket') || descLower.includes('live')) {
    risks.push('Real-time features may add complexity');
  }

  return risks;
}

/**
 * Convert approved plan to Claude Code prompt
 */
export function planToPrompt(plan: BuildPlan): string {
  const stepsList = plan.steps
    .filter(s => s.status !== 'skipped')
    .map(s => `${s.order}. ${s.action}\n   Files: ${s.files.join(', ') || 'N/A'}\n   Why: ${s.reasoning}`)
    .join('\n\n');

  const techStackStr = plan.techStack.join(', ');
  const depsStr = plan.estimatedDependencies.join(', ');

  return `You are building a software project following an APPROVED PLAN. Execute this plan precisely.

## Project Description
${plan.description}

## Technology Stack
${techStackStr}

## Dependencies to Install
${depsStr}

## APPROVED BUILD PLAN - Execute in Order
${stepsList}

## CRITICAL INSTRUCTIONS
1. Create ALL files directly in the CURRENT WORKING DIRECTORY (no subdirectories for project root)
2. Follow the plan steps in order
3. Report completion of each step before moving to the next
4. If you encounter an issue, describe it clearly before attempting to fix
5. After completing all steps, verify the project runs correctly

Begin executing the plan now.`;
}

/**
 * Update a plan step status
 */
export function updatePlanStep(
  plan: BuildPlan,
  stepOrder: number,
  status: BuildPlanStep['status']
): BuildPlan {
  return {
    ...plan,
    steps: plan.steps.map(step =>
      step.order === stepOrder ? { ...step, status } : step
    ),
  };
}

/**
 * Approve a plan for execution
 */
export function approvePlan(plan: BuildPlan): BuildPlan {
  return {
    ...plan,
    status: 'approved',
    approvedAt: new Date(),
  };
}

/**
 * Mark a plan as executing
 */
export function startPlanExecution(plan: BuildPlan, projectId: string): BuildPlan {
  return {
    ...plan,
    status: 'executing',
    projectId,
  };
}

/**
 * Complete a plan
 */
export function completePlan(plan: BuildPlan, success: boolean): BuildPlan {
  return {
    ...plan,
    status: success ? 'complete' : 'failed',
    steps: plan.steps.map(step => ({
      ...step,
      status: step.status === 'pending' || step.status === 'active'
        ? (success ? 'complete' : 'failed')
        : step.status,
    })),
  };
}
