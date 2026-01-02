import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getBuildProject } from '@/lib/db';
import { readProjectFile } from '@/lib/workspaceWatcher';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  try {
    await initDatabase();

    const { projectId, filePath } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    if (!filePath || filePath.length === 0) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    const project = await getBuildProject(projectId);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Join file path segments
    const relativePath = filePath.join('/');

    // Read file content
    const file = await readProjectFile(project.workspacePath, relativePath);

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      content: file.content,
      extension: file.extension,
      size: file.size,
      path: relativePath,
    });
  } catch (error) {
    console.error('[Build API] Error reading project file:', error);
    return NextResponse.json(
      { error: 'Failed to read project file' },
      { status: 500 }
    );
  }
}
