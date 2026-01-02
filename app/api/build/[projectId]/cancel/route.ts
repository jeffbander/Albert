import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, updateBuildProjectStatus } from '@/lib/db';
import { getProjectStatus, cancelBuild } from '@/lib/buildOrchestrator';

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

    // Check if project exists
    const { project } = await getProjectStatus(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check if project is in a cancellable state
    if (project.status === 'complete' || project.status === 'failed') {
      return NextResponse.json(
        { error: `Cannot cancel a ${project.status} build` },
        { status: 400 }
      );
    }

    // Cancel the build
    const cancelled = await cancelBuild(projectId);

    if (cancelled) {
      return NextResponse.json({
        success: true,
        message: 'Build cancelled successfully',
        projectId,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Could not cancel build - it may have already completed',
      });
    }
  } catch (error) {
    console.error('[Build API] Error cancelling project:', error);
    return NextResponse.json(
      { error: 'Failed to cancel build' },
      { status: 500 }
    );
  }
}
