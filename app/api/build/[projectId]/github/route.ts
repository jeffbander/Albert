import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { getProjectStatus } from '@/lib/buildOrchestrator';
import { publishToGitHub, checkGitHubCLI } from '@/lib/githubClient';

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
    const { owner, repo, branch, commitMessage } = body;

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'owner and repo are required' },
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

    if (!project.workspacePath) {
      return NextResponse.json(
        { error: 'Project has no workspace path' },
        { status: 400 }
      );
    }

    // Check GitHub CLI
    const ghStatus = await checkGitHubCLI();
    if (!ghStatus.installed) {
      return NextResponse.json(
        { error: 'GitHub CLI (gh) is not installed. Please install it first.' },
        { status: 500 }
      );
    }
    if (!ghStatus.authenticated) {
      return NextResponse.json(
        { error: 'GitHub CLI is not authenticated. Run "gh auth login" first.' },
        { status: 401 }
      );
    }

    // Publish to GitHub
    const result = await publishToGitHub(
      project.workspacePath,
      { owner, repo, branch: branch || 'main' },
      commitMessage || `Build from Albert Builder: ${project.description.slice(0, 50)}`
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        repoUrl: result.repoUrl,
        commitHash: result.commitHash,
        message: `Successfully pushed to ${result.repoUrl}`,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[GitHub API] Error pushing project:', error);
    return NextResponse.json(
      { error: 'Failed to push to GitHub' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // Check GitHub CLI status
    const ghStatus = await checkGitHubCLI();

    return NextResponse.json({
      success: true,
      github: ghStatus,
    });
  } catch (error) {
    console.error('[GitHub API] Error checking status:', error);
    return NextResponse.json(
      { error: 'Failed to check GitHub status' },
      { status: 500 }
    );
  }
}
