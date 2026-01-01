import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { listProjects } from '@/lib/buildOrchestrator';

export async function GET() {
  try {
    await initDatabase();

    const projects = await listProjects();

    return NextResponse.json({
      success: true,
      projects,
      count: projects.length,
    });
  } catch (error) {
    console.error('[Build API] Error listing projects:', error);
    return NextResponse.json(
      { error: 'Failed to list projects' },
      { status: 500 }
    );
  }
}
