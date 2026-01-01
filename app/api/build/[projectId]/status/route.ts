import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { getProjectStatus } from '@/lib/buildOrchestrator';

export async function GET(
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

    const { project, logs } = await getProjectStatus(projectId);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      project,
      logs,
    });
  } catch (error) {
    console.error('[Build API] Error getting project status:', error);
    return NextResponse.json(
      { error: 'Failed to get project status' },
      { status: 500 }
    );
  }
}
