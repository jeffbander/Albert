'use client';

import { useState, useCallback } from 'react';

// Types copied from workspaceWatcher to avoid importing Node.js module in client
export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  children?: FileNode[];
  size?: number;
  modifiedAt?: Date;
  isNew?: boolean;
}

// Utility functions that don't need Node.js
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'react',
    'js': 'javascript',
    'jsx': 'react',
    'json': 'json',
    'md': 'markdown',
    'css': 'css',
    'scss': 'sass',
    'html': 'html',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'yaml': 'yaml',
    'yml': 'yaml',
    'env': 'env',
    'gitignore': 'git',
  };
  return iconMap[ext] || 'file';
}

interface BuildFileTreeProps {
  tree: FileNode | null;
  onFileSelect?: (node: FileNode) => void;
  selectedPath?: string;
  maxHeight?: string;
}

// File type icons (simplified SVGs)
const Icons: Record<string, React.FC<{ className?: string }>> = {
  folder: ({ className }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  ),
  'folder-open': ({ className }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clipRule="evenodd" />
      <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
    </svg>
  ),
  file: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  typescript: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="2" fill="#3178C6" />
      <text x="5" y="17" fontSize="10" fontWeight="bold" fill="white">TS</text>
    </svg>
  ),
  javascript: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="2" fill="#F7DF1E" />
      <text x="7" y="17" fontSize="10" fontWeight="bold" fill="black">JS</text>
    </svg>
  ),
  react: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="#61DAFB">
      <circle cx="12" cy="12" r="2" />
      <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61DAFB" strokeWidth="1" />
      <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61DAFB" strokeWidth="1" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#61DAFB" strokeWidth="1" transform="rotate(120 12 12)" />
    </svg>
  ),
  json: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="2" fill="#FFA500" />
      <text x="2" y="16" fontSize="8" fontWeight="bold" fill="white">{'{}'}</text>
    </svg>
  ),
  css: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="2" fill="#264DE4" />
      <text x="2" y="16" fontSize="9" fontWeight="bold" fill="white">CSS</text>
    </svg>
  ),
  html: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="2" fill="#E34F26" />
      <text x="0" y="16" fontSize="8" fontWeight="bold" fill="white">HTML</text>
    </svg>
  ),
  markdown: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="2" fill="#083FA1" />
      <text x="3" y="16" fontSize="9" fontWeight="bold" fill="white">MD</text>
    </svg>
  ),
  python: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="2" fill="#3776AB" />
      <text x="5" y="17" fontSize="10" fontWeight="bold" fill="#FFD43B">Py</text>
    </svg>
  ),
  chevron: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
};

function FileIcon({ name, isDirectory, isOpen }: { name: string; isDirectory: boolean; isOpen?: boolean }) {
  if (isDirectory) {
    const Icon = isOpen ? Icons['folder-open'] : Icons.folder;
    return <Icon className="w-4 h-4 text-amber-400" />;
  }

  const iconType = getFileIcon(name);
  const Icon = Icons[iconType] || Icons.file;
  return <Icon className="w-4 h-4" />;
}

function TreeNode({
  node,
  depth = 0,
  onSelect,
  selectedPath,
  defaultExpanded = true,
}: {
  node: FileNode;
  depth?: number;
  onSelect?: (node: FileNode) => void;
  selectedPath?: string;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded && depth < 2);
  const isSelected = selectedPath === node.relativePath;

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);
    } else {
      onSelect?.(node);
    }
  }, [node, isExpanded, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        className={`
          flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer
          ${isSelected ? 'bg-purple-600/30 text-white' : 'hover:bg-gray-800/50 text-gray-300'}
          ${node.isNew ? 'animate-pulse bg-green-900/20' : ''}
          transition-colors duration-150
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {/* Expand/collapse indicator for directories */}
        {node.isDirectory && (
          <Icons.chevron
            className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        )}
        {!node.isDirectory && <span className="w-3" />}

        {/* File/folder icon */}
        <FileIcon name={node.name} isDirectory={node.isDirectory} isOpen={isExpanded} />

        {/* Name */}
        <span className="text-sm truncate flex-1">{node.name}</span>

        {/* New file badge */}
        {node.isNew && (
          <span className="text-xs px-1.5 py-0.5 bg-green-600 text-white rounded">NEW</span>
        )}
      </div>

      {/* Children (if directory and expanded) */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
              defaultExpanded={depth < 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function BuildFileTree({
  tree,
  onFileSelect,
  selectedPath,
  maxHeight = '400px',
}: BuildFileTreeProps) {
  if (!tree) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
        No files yet. Start a build to see the project structure.
      </div>
    );
  }

  const hasFiles = tree.children && tree.children.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <span className="text-sm font-medium text-gray-300">Files</span>
        {hasFiles && (
          <span className="text-xs text-gray-500">
            {countFiles(tree)} files
          </span>
        )}
      </div>

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto py-2"
        style={{ maxHeight }}
      >
        {hasFiles ? (
          tree.children?.map((child) => (
            <TreeNode
              key={child.relativePath}
              node={child}
              onSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Empty directory
          </div>
        )}
      </div>
    </div>
  );
}

function countFiles(node: FileNode): number {
  if (!node.isDirectory) return 1;
  return (node.children || []).reduce((sum, child) => sum + countFiles(child), 0);
}
