import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Project root directory
const PROJECT_ROOT = process.cwd();

// Allowed directories for reading (security measure)
const ALLOWED_DIRS = ['app', 'lib', 'components', 'hooks', 'types', 'public', 'styles'];
const ALLOWED_ROOT_FILES = ['package.json', 'tsconfig.json', 'tailwind.config.ts', 'next.config.mjs', '.env.example'];

function isPathAllowed(filePath: string): boolean {
  const normalized = path.normalize(filePath).replace(/\\/g, '/');

  // Check if it's an allowed root file
  if (ALLOWED_ROOT_FILES.includes(normalized)) {
    return true;
  }

  // Check if it starts with an allowed directory
  const firstDir = normalized.split('/')[0];
  if (ALLOWED_DIRS.includes(firstDir)) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'read': {
        const { filePath } = params;

        if (!filePath) {
          return NextResponse.json({
            success: false,
            error: 'File path is required',
          }, { status: 400 });
        }

        if (!isPathAllowed(filePath)) {
          return NextResponse.json({
            success: false,
            error: `Access denied. Only these directories are allowed: ${ALLOWED_DIRS.join(', ')}`,
          }, { status: 403 });
        }

        const fullPath = path.join(PROJECT_ROOT, filePath);

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          return NextResponse.json({
            success: true,
            filePath,
            content,
            lines: content.split('\n').length,
          });
        } catch (err) {
          return NextResponse.json({
            success: false,
            error: `File not found: ${filePath}`,
          }, { status: 404 });
        }
      }

      case 'list': {
        const { directory } = params;
        const targetDir = directory || '';

        if (targetDir && !ALLOWED_DIRS.includes(targetDir.split('/')[0])) {
          return NextResponse.json({
            success: false,
            error: `Access denied. Only these directories are allowed: ${ALLOWED_DIRS.join(', ')}`,
          }, { status: 403 });
        }

        const fullPath = path.join(PROJECT_ROOT, targetDir);

        try {
          const entries = await fs.readdir(fullPath, { withFileTypes: true });
          const files: { name: string; type: 'file' | 'directory'; path: string }[] = [];

          for (const entry of entries) {
            // Skip hidden files and node_modules
            if (entry.name.startsWith('.') || entry.name === 'node_modules') {
              continue;
            }

            files.push({
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              path: targetDir ? `${targetDir}/${entry.name}` : entry.name,
            });
          }

          // Sort: directories first, then files
          files.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          return NextResponse.json({
            success: true,
            directory: targetDir || '(root)',
            files,
          });
        } catch (err) {
          return NextResponse.json({
            success: false,
            error: `Directory not found: ${targetDir}`,
          }, { status: 404 });
        }
      }

      case 'suggest': {
        const { filePath, description, priority } = params;

        // Log the suggestion (could be stored in a database)
        console.log('[Albert Suggestion]', {
          filePath,
          description,
          priority: priority || 'medium',
          timestamp: new Date().toISOString(),
        });

        // For now, just acknowledge the suggestion
        // In the future, this could create GitHub issues or store in a database
        return NextResponse.json({
          success: true,
          message: `Improvement suggestion recorded: ${description}`,
          suggestion: {
            filePath,
            description,
            priority: priority || 'medium',
          },
        });
      }

      case 'structure': {
        // Return a summary of the project structure
        const structure = {
          'app/': 'Next.js pages and API routes',
          'app/page.tsx': 'Main Albert voice interface',
          'app/builder/': 'Builder dashboard for managing projects',
          'app/api/': 'Backend API endpoints',
          'lib/': 'Core utilities and business logic',
          'lib/buildTools.ts': 'Tool definitions for voice commands',
          'lib/prompts.ts': 'System prompts and personality',
          'lib/buildOrchestrator.ts': 'Project building logic',
          'lib/db.ts': 'Database operations',
          'lib/metacognition.ts': 'Self-reflection and memory',
          'components/': 'React UI components',
          'components/EchoOrb.tsx': 'The animated voice orb',
          'components/AlbertChatWindow.tsx': 'Chat message display',
          'hooks/': 'Custom React hooks',
          'types/': 'TypeScript type definitions',
        };

        return NextResponse.json({
          success: true,
          structure,
          description: 'Albert is a voice-first AI assistant built with Next.js, using OpenAI Realtime API for voice and Claude Code for building projects.',
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Codebase API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
    }, { status: 500 });
  }
}
