import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { getProjectStatus, retryBuild } from '@/lib/buildOrchestrator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await initDatabase();

    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { modifications } = body;

    // Check if project exists
    const { project } = await getProjectStatus(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check if project is in a retryable state
    if (project.status !== 'failed') {
      return NextResponse.json(
        { error: `Cannot retry a ${project.status} build. Only failed builds can be retried.` },
        { status: 400 }
      );
    }

    // Retry the build
    const newProjectId = await retryBuild(projectId, modifications);

    return NextResponse.json({
      success: true,
      message: 'Build retry started',
      originalProjectId: projectId,
      newProjectId,
    });
  } catch (error) {
    console.error('[Build API] Error retrying project:', error);
    return NextResponse.json(
      { error: 'Failed to retry build' },
      { status: 500 }
    );
  }
}
