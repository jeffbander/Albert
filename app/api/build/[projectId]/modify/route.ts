import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { modifyExistingProject, getProjectStatus } from '@/lib/buildOrchestrator';

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

    const body = await request.json();
    const { changeDescription } = body;

    if (!changeDescription) {
      return NextResponse.json(
        { error: 'changeDescription is required' },
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

    // Start modification asynchronously
    modifyExistingProject(projectId, changeDescription).catch((error) => {
      console.error(`[Build API] Modification failed for ${projectId}:`, error);
    });

    return NextResponse.json({
      success: true,
      message: 'Modification started',
      projectId,
    });
  } catch (error) {
    console.error('[Build API] Error modifying project:', error);
    return NextResponse.json(
      { error: 'Failed to modify project' },
      { status: 500 }
    );
  }
}
