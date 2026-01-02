import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';
import { getProjectStatus } from '@/lib/buildOrchestrator';
import fs from 'fs/promises';
import path from 'path';

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

    // Check if project exists
    const { project, logs } = await getProjectStatus(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get project structure
    let files: string[] = [];
    let readme: string | null = null;
    let packageJson: Record<string, unknown> | null = null;

    if (project.workspacePath) {
      try {
        // List files
        files = await listFilesRecursive(project.workspacePath, 3);

        // Read README if exists
        const readmePath = path.join(project.workspacePath, 'README.md');
        try {
          readme = await fs.readFile(readmePath, 'utf-8');
        } catch {
          // No README
        }

        // Read package.json if exists
        const pkgPath = path.join(project.workspacePath, 'package.json');
        try {
          const pkgContent = await fs.readFile(pkgPath, 'utf-8');
          packageJson = JSON.parse(pkgContent);
        } catch {
          // No package.json
        }
      } catch (e) {
        console.error('Error reading project files:', e);
      }
    }

    // Build description
    const description = buildProjectDescription(project, files, readme, packageJson);

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        description: project.description,
        projectType: project.projectType,
        status: project.status,
        preferredStack: project.preferredStack,
        localPort: project.localPort,
        deployUrl: project.deployUrl,
      },
      files,
      readme: readme?.slice(0, 1000), // Truncate for response
      packageJson: packageJson ? {
        name: packageJson.name,
        dependencies: Object.keys((packageJson.dependencies as Record<string, unknown>) || {}),
        scripts: Object.keys((packageJson.scripts as Record<string, unknown>) || {}),
      } : null,
      summary: description,
    });
  } catch (error) {
    console.error('[Build API] Error describing project:', error);
    return NextResponse.json(
      { error: 'Failed to describe project' },
      { status: 500 }
    );
  }
}

async function listFilesRecursive(dir: string, maxDepth: number, currentDepth = 0): Promise<string[]> {
  if (currentDepth >= maxDepth) return [];

  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const relativePath = currentDepth === 0 ? entry.name : entry.name;
      if (entry.isDirectory()) {
        files.push(`${relativePath}/`);
        const subFiles = await listFilesRecursive(
          path.join(dir, entry.name),
          maxDepth,
          currentDepth + 1
        );
        files.push(...subFiles.map(f => `${relativePath}/${f}`));
      } else {
        files.push(relativePath);
      }
    }
  } catch {
    // Directory might not exist
  }
  return files;
}

function buildProjectDescription(
  project: { description: string; projectType: string; preferredStack?: string | null; localPort?: number | null },
  files: string[],
  readme: string | null,
  packageJson: Record<string, unknown> | null
): string {
  const parts: string[] = [];

  parts.push(`This is a ${project.projectType} project: "${project.description}".`);

  if (project.preferredStack) {
    parts.push(`It was built using ${project.preferredStack}.`);
  }

  if (packageJson) {
    const deps = Object.keys((packageJson.dependencies as Record<string, unknown>) || {});
    if (deps.length > 0) {
      parts.push(`Main dependencies include: ${deps.slice(0, 5).join(', ')}${deps.length > 5 ? ` and ${deps.length - 5} more` : ''}.`);
    }
  }

  const componentFiles = files.filter(f => f.includes('components/') || f.endsWith('.tsx') || f.endsWith('.jsx'));
  if (componentFiles.length > 0) {
    parts.push(`The project has ${componentFiles.length} component files.`);
  }

  if (project.localPort) {
    parts.push(`It's currently running on localhost:${project.localPort}.`);
  }

  return parts.join(' ');
}
