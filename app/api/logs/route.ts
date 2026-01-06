import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getAllBuildProjects, getBuildLogs } from '@/lib/db';

const PROJECT_ROOT = process.cwd();

// Log file paths
const LOG_FILES = {
  'self-improvement': path.join(PROJECT_ROOT, 'self-improvement-log.json'),
};

interface LogEntry {
  id: string;
  type: 'self-improvement' | 'build' | 'build-activity' | 'system';
  timestamp: string;
  title: string;
  status?: string;
  details?: Record<string, unknown>;
}

async function loadJsonLog(filePath: string): Promise<unknown[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'self-improvement', 'build', 'all'
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const allLogs: LogEntry[] = [];

    // Load self-improvement logs
    if (!type || type === 'all' || type === 'self-improvement') {
      const selfImproveLogs = await loadJsonLog(LOG_FILES['self-improvement']);
      for (const log of selfImproveLogs as Array<{
        id: string;
        timestamp: string;
        task: string;
        status: string;
        reason?: string;
        error?: string;
        commitSha?: string;
        cost?: number;
      }>) {
        allLogs.push({
          id: log.id,
          type: 'self-improvement',
          timestamp: log.timestamp,
          title: log.task,
          status: log.status,
          details: {
            reason: log.reason,
            error: log.error,
            commitSha: log.commitSha,
            cost: log.cost,
          },
        });
      }
    }

    // Load build project logs
    if (!type || type === 'all' || type === 'build') {
      const projects = await getAllBuildProjects();
      for (const project of projects) {
        allLogs.push({
          id: project.id,
          type: 'build',
          timestamp: project.createdAt.toISOString(),
          title: project.description.slice(0, 100),
          status: project.status,
          details: {
            projectType: project.projectType,
            workspacePath: project.workspacePath,
            localPort: project.localPort,
            deployUrl: project.deployUrl,
            error: project.error,
            commitSha: project.commitSha,
            githubUrl: project.githubUrl,
          },
        });

        // Also include build activity logs
        if (type === 'build' || type === 'build-activity') {
          const buildLogs = await getBuildLogs(project.id);
          for (const log of buildLogs) {
            allLogs.push({
              id: log.id,
              type: 'build-activity',
              timestamp: log.timestamp.toISOString(),
              title: log.message,
              status: log.phase,
              details: {
                projectId: log.projectId,
                phase: log.phase,
              },
            });
          }
        }
      }
    }

    // Sort by timestamp (newest first)
    allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    const limitedLogs = allLogs.slice(0, limit);

    // Group by type for summary
    const summary = {
      total: allLogs.length,
      byType: {
        'self-improvement': allLogs.filter(l => l.type === 'self-improvement').length,
        build: allLogs.filter(l => l.type === 'build').length,
        'build-activity': allLogs.filter(l => l.type === 'build-activity').length,
      },
      byStatus: {
        completed: allLogs.filter(l => l.status === 'completed' || l.status === 'complete').length,
        failed: allLogs.filter(l => l.status === 'failed').length,
        running: allLogs.filter(l => l.status === 'running' || l.status === 'building').length,
      },
    };

    return NextResponse.json({
      success: true,
      logs: limitedLogs,
      summary,
    });
  } catch (error) {
    console.error('[Logs API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load logs',
    }, { status: 500 });
  }
}

// Clear specific log type
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (!type || !LOG_FILES[type as keyof typeof LOG_FILES]) {
    return NextResponse.json({
      success: false,
      error: 'Invalid log type. Available: self-improvement',
    }, { status: 400 });
  }

  try {
    await fs.writeFile(LOG_FILES[type as keyof typeof LOG_FILES], '[]');
    return NextResponse.json({
      success: true,
      message: `Cleared ${type} logs`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear logs',
    }, { status: 500 });
  }
}
