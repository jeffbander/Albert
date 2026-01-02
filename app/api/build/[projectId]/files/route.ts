import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getBuildProject } from '@/lib/db';
import { listProjectFiles, readProjectFile } from '@/lib/workspaceWatcher';
import { stat, readdir } from 'fs/promises';
import { join, relative, basename } from 'path';
import type { FileNode } from '@/lib/workspaceWatcher';

// Files/directories to ignore
const IGNORED_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  '__pycache__',
  '.DS_Store',
  'thumbs.db',
];

function shouldIgnore(filename: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => {
    if (pattern.startsWith('*')) {
      return filename.endsWith(pattern.slice(1));
    }
    return filename === pattern;
  });
}

async function buildFileTree(dirPath: string, rootPath: string): Promise<FileNode> {
  const name = basename(dirPath);
  const relativePath = relative(rootPath, dirPath) || '.';

  const node: FileNode = {
    name: name || basename(rootPath),
    path: dirPath,
    relativePath,
    isDirectory: true,
    children: [],
  };

  try {
    const entries = await readdir(dirPath);

    for (const entry of entries) {
      if (shouldIgnore(entry)) continue;

      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath).catch(() => null);

      if (!stats) continue;

      if (stats.isDirectory()) {
        const childNode = await buildFileTree(fullPath, rootPath);
        node.children?.push(childNode);
      } else {
        node.children?.push({
          name: entry,
          path: fullPath,
          relativePath: relative(rootPath, fullPath),
          isDirectory: false,
          size: stats.size,
          modifiedAt: stats.mtime,
        });
      }
    }

    // Sort: directories first, then alphabetically
    node.children?.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    // Directory might not exist yet
  }

  return node;
}

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

    const project = await getBuildProject(projectId);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Build file tree from workspace path
    const tree = await buildFileTree(project.workspacePath, project.workspacePath);

    // Also get flat file list
    const files = await listProjectFiles(project.workspacePath);

    return NextResponse.json({
      success: true,
      tree,
      files,
      workspacePath: project.workspacePath,
    });
  } catch (error) {
    console.error('[Build API] Error getting project files:', error);
    return NextResponse.json(
      { error: 'Failed to get project files' },
      { status: 500 }
    );
  }
}
