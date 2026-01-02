'use client';

import { useState, useEffect } from 'react';

// Utility function to get language for syntax highlighting (copied to avoid Node.js import)
function getLanguage(filename: string): string {
  const ext = ('.' + (filename.split('.').pop() || '')).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sh': 'bash',
    '.bash': 'bash',
    '.sql': 'sql',
  };
  return langMap[ext] || 'text';
}

interface FileContentViewerProps {
  content: string | null;
  filename: string;
  isLoading?: boolean;
  isNew?: boolean;
  size?: number;
  onClose?: () => void;
}

// Simple syntax highlighting with regex patterns
const SYNTAX_PATTERNS: Record<string, { pattern: RegExp; className: string }[]> = {
  typescript: [
    { pattern: /\/\/.*$/gm, className: 'text-gray-500' }, // Comments
    { pattern: /\/\*[\s\S]*?\*\//g, className: 'text-gray-500' }, // Block comments
    { pattern: /(["'`])(?:(?=(\\?))\2.)*?\1/g, className: 'text-green-400' }, // Strings
    { pattern: /\b(const|let|var|function|class|interface|type|enum|import|export|from|as|default|async|await|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|this|super|extends|implements|static|private|public|protected|readonly|typeof|instanceof|in|of|void|null|undefined|true|false)\b/g, className: 'text-purple-400' }, // Keywords
    { pattern: /\b(string|number|boolean|any|never|unknown|object|symbol|bigint)\b/g, className: 'text-cyan-400' }, // Types
    { pattern: /\b(\d+(?:\.\d+)?)\b/g, className: 'text-orange-400' }, // Numbers
    { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, className: 'text-yellow-300' }, // PascalCase (likely types/classes)
  ],
  javascript: [
    { pattern: /\/\/.*$/gm, className: 'text-gray-500' },
    { pattern: /\/\*[\s\S]*?\*\//g, className: 'text-gray-500' },
    { pattern: /(["'`])(?:(?=(\\?))\2.)*?\1/g, className: 'text-green-400' },
    { pattern: /\b(const|let|var|function|class|import|export|from|as|default|async|await|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|this|super|extends|static|typeof|instanceof|in|of|void|null|undefined|true|false)\b/g, className: 'text-purple-400' },
    { pattern: /\b(\d+(?:\.\d+)?)\b/g, className: 'text-orange-400' },
  ],
  json: [
    { pattern: /"(?:[^"\\]|\\.)*"/g, className: 'text-green-400' },
    { pattern: /\b(true|false|null)\b/g, className: 'text-purple-400' },
    { pattern: /\b(\d+(?:\.\d+)?)\b/g, className: 'text-orange-400' },
  ],
  css: [
    { pattern: /\/\*[\s\S]*?\*\//g, className: 'text-gray-500' },
    { pattern: /([.#]?[a-zA-Z_][a-zA-Z0-9_-]*)\s*\{/g, className: 'text-yellow-400' }, // Selectors
    { pattern: /([a-z-]+)(?=\s*:)/g, className: 'text-cyan-400' }, // Properties
    { pattern: /(["'])(?:(?=(\\?))\2.)*?\1/g, className: 'text-green-400' },
    { pattern: /#[0-9a-fA-F]{3,8}\b/g, className: 'text-orange-400' }, // Colors
  ],
  html: [
    { pattern: /<!--[\s\S]*?-->/g, className: 'text-gray-500' },
    { pattern: /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g, className: 'text-red-400' }, // Tags
    { pattern: /\s([a-zA-Z-]+)(?==)/g, className: 'text-yellow-400' }, // Attributes
    { pattern: /(["'])(?:(?=(\\?))\2.)*?\1/g, className: 'text-green-400' },
  ],
  markdown: [
    { pattern: /^#{1,6}\s.+$/gm, className: 'text-purple-400 font-bold' }, // Headers
    { pattern: /\*\*[^*]+\*\*/g, className: 'text-white font-bold' }, // Bold
    { pattern: /\*[^*]+\*/g, className: 'text-white italic' }, // Italic
    { pattern: /`[^`]+`/g, className: 'text-green-400 bg-gray-800 px-1 rounded' }, // Inline code
    { pattern: /^\s*[-*+]\s/gm, className: 'text-cyan-400' }, // List items
    { pattern: /\[([^\]]+)\]\([^)]+\)/g, className: 'text-blue-400' }, // Links
  ],
};

// Apply syntax highlighting to content
function highlightSyntax(content: string, language: string): React.ReactNode[] {
  const patterns = SYNTAX_PATTERNS[language] || SYNTAX_PATTERNS.typescript;

  // Split content into lines for line numbers
  const lines = content.split('\n');

  return lines.map((line, lineIndex) => {
    // For each line, apply highlighting
    let highlighted = line;
    const replacements: { start: number; end: number; className: string; text: string }[] = [];

    // Find all matches
    patterns.forEach(({ pattern, className }) => {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        replacements.push({
          start: match.index,
          end: match.index + match[0].length,
          className,
          text: match[0],
        });
      }
    });

    // Sort by start position and remove overlaps
    replacements.sort((a, b) => a.start - b.start);
    const nonOverlapping: typeof replacements = [];
    let lastEnd = 0;
    for (const r of replacements) {
      if (r.start >= lastEnd) {
        nonOverlapping.push(r);
        lastEnd = r.end;
      }
    }

    // Build highlighted line
    const parts: React.ReactNode[] = [];
    let pos = 0;
    for (const { start, end, className, text } of nonOverlapping) {
      if (start > pos) {
        parts.push(<span key={`${lineIndex}-${pos}`}>{line.slice(pos, start)}</span>);
      }
      parts.push(
        <span key={`${lineIndex}-${start}`} className={className}>
          {text}
        </span>
      );
      pos = end;
    }
    if (pos < line.length) {
      parts.push(<span key={`${lineIndex}-end`}>{line.slice(pos)}</span>);
    }

    return (
      <div key={lineIndex} className="table-row">
        <span className="table-cell text-right pr-4 text-gray-600 select-none w-12">
          {lineIndex + 1}
        </span>
        <span className="table-cell">{parts.length > 0 ? parts : ' '}</span>
      </div>
    );
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileContentViewer({
  content,
  filename,
  isLoading = false,
  isNew = false,
  size,
  onClose,
}: FileContentViewerProps) {
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const language = getLanguage(filename);

  const handleCopyAll = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-700">
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          Select a file to view its contents
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-200">{filename}</span>
          {isNew && (
            <span className="text-xs px-1.5 py-0.5 bg-green-600 text-white rounded animate-pulse">
              NEW
            </span>
          )}
          <span className="text-xs text-gray-500">{language}</span>
          {size && <span className="text-xs text-gray-500">{formatFileSize(size)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAll}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Copy all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-sm font-mono text-gray-300 table w-full">
          {highlightSyntax(content, language)}
        </pre>
      </div>
    </div>
  );
}
