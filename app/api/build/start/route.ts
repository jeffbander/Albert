import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { startBuild } from '@/lib/buildOrchestrator';
import type { ProjectType, DeployTarget } from '@/types/build';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const body = await request.json();
    const { projectDescription, projectType, preferredStack, deployTarget } = body;

    if (!projectDescription || !projectType) {
      return NextResponse.json(
        { error: 'projectDescription and projectType are required' },
        { status: 400 }
      );
    }

    // Validate projectType
    const validTypes: ProjectType[] = ['web-app', 'api', 'cli', 'library', 'full-stack'];
    if (!validTypes.includes(projectType)) {
      return NextResponse.json(
        { error: `Invalid projectType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate deployTarget if provided
    const validTargets: DeployTarget[] = ['localhost', 'vercel'];
    if (deployTarget && !validTargets.includes(deployTarget)) {
      return NextResponse.json(
        { error: `Invalid deployTarget. Must be one of: ${validTargets.join(', ')}` },
        { status: 400 }
      );
    }

    const projectId = await startBuild({
      description: projectDescription,
      projectType,
      preferredStack,
      deployTarget,
    });

    return NextResponse.json({
      success: true,
      projectId,
      message: `Build started! Project ID: ${projectId}`,
    });
  } catch (error) {
    console.error('[Build API] Error starting build:', error);
    return NextResponse.json(
      { error: 'Failed to start build', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
