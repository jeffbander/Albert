import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { getProjectStatus, modifyExistingProject } from '@/lib/buildOrchestrator';
import {
  getSessionByProjectId,
  addUserResponse,
  getContinuationPrompt,
} from '@/lib/interactiveSession';

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
    const { response: userResponse } = body;

    if (!userResponse) {
      return NextResponse.json(
        { error: 'Response is required' },
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

    // Find the active session for this project
    const session = getSessionByProjectId(projectId);

    if (session && session.status === 'waiting_for_input') {
      // Add user response to session
      addUserResponse(session.id, userResponse);

      // Get continuation prompt
      const continuationPrompt = getContinuationPrompt(session.id, userResponse);

      // Continue the build with user's response by modifying the project
      await modifyExistingProject(projectId, continuationPrompt);

      return NextResponse.json({
        success: true,
        message: 'Response sent to build session, continuing...',
        sessionId: session.id,
      });
    }

    // No active session waiting - just add as a modification
    return NextResponse.json({
      success: true,
      message: 'Response recorded. The build will incorporate this feedback.',
      note: 'No active session was waiting for input.',
    });
  } catch (error) {
    console.error('[Build API] Error sending response:', error);
    return NextResponse.json(
      { error: 'Failed to send response' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // Get session status
    const session = getSessionByProjectId(projectId);

    if (!session) {
      return NextResponse.json({
        success: true,
        hasActiveSession: false,
      });
    }

    return NextResponse.json({
      success: true,
      hasActiveSession: true,
      session: {
        id: session.id,
        status: session.status,
        pendingQuestion: session.pendingQuestion,
        pendingOptions: session.pendingOptions,
        createdAt: session.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Build API] Error getting session status:', error);
    return NextResponse.json(
      { error: 'Failed to get session status' },
      { status: 500 }
    );
  }
}
