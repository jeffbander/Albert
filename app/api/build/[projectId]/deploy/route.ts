import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, updateBuildProjectStatus } from '@/lib/db';
import { getProjectStatus, emitBuildProgress } from '@/lib/buildOrchestrator';
import { deployToVercel, deployToProduction, checkVercelCLI } from '@/lib/vercelDeploy';

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
    const { production = false, projectName } = body;

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

    // Check Vercel CLI
    const vercelStatus = await checkVercelCLI();
    if (!vercelStatus.installed) {
      return NextResponse.json(
        { error: 'Vercel CLI is not installed. Run "npm i -g vercel" first.' },
        { status: 500 }
      );
    }
    if (!vercelStatus.authenticated) {
      return NextResponse.json(
        { error: 'Vercel CLI is not authenticated. Run "vercel login" or set VERCEL_TOKEN.' },
        { status: 401 }
      );
    }

    // Emit progress
    emitBuildProgress(projectId, 'deploying', 'Deploying to Vercel...');

    // Deploy
    const config = {
      projectName: projectName || `albert-${projectId.slice(0, 8)}`,
      token: process.env.VERCEL_TOKEN,
    };

    const result = production
      ? await deployToProduction(project.workspacePath, config)
      : await deployToVercel(project.workspacePath, config);

    if (result.success) {
      // Update project with deploy URL
      await updateBuildProjectStatus(projectId, 'complete', { deployUrl: result.url });

      emitBuildProgress(projectId, 'complete', `Deployed successfully to ${result.url}`);

      return NextResponse.json({
        success: true,
        url: result.url,
        productionUrl: result.productionUrl,
        message: `Successfully deployed to ${result.url}`,
      });
    } else {
      emitBuildProgress(projectId, 'failed', `Deployment failed: ${result.error}`);

      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Deploy API] Error deploying project:', error);
    return NextResponse.json(
      { error: 'Failed to deploy to Vercel' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Check Vercel CLI status
    const vercelStatus = await checkVercelCLI();

    return NextResponse.json({
      success: true,
      vercel: vercelStatus,
    });
  } catch (error) {
    console.error('[Deploy API] Error checking status:', error);
    return NextResponse.json(
      { error: 'Failed to check Vercel status' },
      { status: 500 }
    );
  }
}
