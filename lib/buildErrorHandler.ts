/**
 * Build Error Handler - Detects, categorizes, and suggests fixes for build errors
 * Enables Albert to learn from and proactively fix common issues.
 */

export type ErrorType =
  | 'compile'
  | 'runtime'
  | 'dependency'
  | 'type'
  | 'syntax'
  | 'import'
  | 'config'
  | 'network'
  | 'permission'
  | 'unknown';

export interface BuildError {
  id: string;
  type: ErrorType;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  suggestedFix?: string;
  severity: 'error' | 'warning' | 'info';
  timestamp: Date;
}

export interface ErrorPattern {
  pattern: RegExp;
  type: ErrorType;
  extractInfo: (match: RegExpMatchArray, fullText: string) => Partial<BuildError>;
  suggestFix: (error: Partial<BuildError>) => string;
}

// Common error patterns and their fixes
const ERROR_PATTERNS: ErrorPattern[] = [
  // TypeScript/JavaScript errors
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    type: 'import',
    extractInfo: (match) => ({
      message: match[0],
      code: match[1],
    }),
    suggestFix: (error) => `Install the missing module: npm install ${error.code}`,
  },
  {
    pattern: /Module not found: Can't resolve ['"]([^'"]+)['"]/i,
    type: 'import',
    extractInfo: (match) => ({
      message: match[0],
      code: match[1],
    }),
    suggestFix: (error) => `Install the missing module: npm install ${error.code}`,
  },
  {
    pattern: /TS(\d+): (.+)/,
    type: 'type',
    extractInfo: (match) => ({
      message: match[2],
      code: `TS${match[1]}`,
    }),
    suggestFix: (error) => {
      const code = error.code || '';
      if (code === 'TS2307') return 'Module not found. Install the package or fix the import path.';
      if (code === 'TS2339') return 'Property does not exist. Check the object type or add the property to the interface.';
      if (code === 'TS2345') return 'Type mismatch. Ensure the argument matches the expected parameter type.';
      if (code === 'TS7006') return 'Parameter implicitly has any type. Add explicit type annotation.';
      return 'Fix the TypeScript error based on the message above.';
    },
  },
  {
    pattern: /SyntaxError: (.+)/i,
    type: 'syntax',
    extractInfo: (match) => ({
      message: match[1],
    }),
    suggestFix: () => 'Check for missing brackets, semicolons, or invalid syntax.',
  },
  {
    pattern: /error: (.+) at (.+):(\d+):(\d+)/i,
    type: 'compile',
    extractInfo: (match) => ({
      message: match[1],
      file: match[2],
      line: parseInt(match[3]),
      column: parseInt(match[4]),
    }),
    suggestFix: (error) => `Fix the error at ${error.file}:${error.line}`,
  },
  // npm/package errors
  {
    pattern: /npm ERR! code (E\w+)/i,
    type: 'dependency',
    extractInfo: (match) => ({
      code: match[1],
      message: `npm error: ${match[1]}`,
    }),
    suggestFix: (error) => {
      const code = error.code || '';
      if (code === 'ENOENT') return 'File or directory not found. Check paths and run npm install.';
      if (code === 'EACCES') return 'Permission denied. Try with sudo or fix permissions.';
      if (code === 'ERESOLVE') return 'Dependency conflict. Try npm install --force or --legacy-peer-deps.';
      return 'Try clearing npm cache: npm cache clean --force && npm install';
    },
  },
  {
    pattern: /peer dep missing: ([^,]+)/i,
    type: 'dependency',
    extractInfo: (match) => ({
      message: match[0],
      code: match[1],
    }),
    suggestFix: (error) => `Install peer dependency: npm install ${error.code}`,
  },
  // Network errors
  {
    pattern: /ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i,
    type: 'network',
    extractInfo: (match) => ({
      message: `Network error: ${match[0]}`,
    }),
    suggestFix: () => 'Check network connection. The remote server may be unreachable.',
  },
  {
    pattern: /fetch failed|Failed to fetch/i,
    type: 'network',
    extractInfo: (match) => ({
      message: match[0],
    }),
    suggestFix: () => 'Network request failed. Check the URL and your internet connection.',
  },
  // Build tool errors
  {
    pattern: /vite.*error/i,
    type: 'config',
    extractInfo: (match, fullText) => ({
      message: fullText.slice(0, 200),
    }),
    suggestFix: () => 'Check vite.config.ts for configuration issues.',
  },
  {
    pattern: /next.*error/i,
    type: 'config',
    extractInfo: (match, fullText) => ({
      message: fullText.slice(0, 200),
    }),
    suggestFix: () => 'Check next.config.js for configuration issues.',
  },
  // Permission errors
  {
    pattern: /EACCES|permission denied/i,
    type: 'permission',
    extractInfo: (match) => ({
      message: match[0],
    }),
    suggestFix: () => 'Permission denied. Check file permissions or run with elevated privileges.',
  },
];

/**
 * Detect errors from build output
 */
export function detectErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    for (const pattern of ERROR_PATTERNS) {
      const match = line.match(pattern.pattern);
      if (match) {
        const info = pattern.extractInfo(match, output);
        const error: BuildError = {
          id: crypto.randomUUID(),
          type: pattern.type,
          message: info.message || match[0],
          file: info.file,
          line: info.line,
          column: info.column,
          code: info.code,
          suggestedFix: pattern.suggestFix(info),
          severity: 'error',
          timestamp: new Date(),
        };
        errors.push(error);
        break; // Only match first pattern per line
      }
    }
  }

  // Deduplicate by message
  const seen = new Set<string>();
  return errors.filter(e => {
    if (seen.has(e.message)) return false;
    seen.add(e.message);
    return true;
  });
}

/**
 * Categorize error severity
 */
export function categorizeError(error: BuildError): BuildError {
  // Warnings
  if (error.message.toLowerCase().includes('warning') ||
      error.message.toLowerCase().includes('deprecated')) {
    return { ...error, severity: 'warning' };
  }

  // Info
  if (error.message.toLowerCase().includes('info') ||
      error.message.toLowerCase().includes('note')) {
    return { ...error, severity: 'info' };
  }

  return error;
}

/**
 * Generate a fix prompt for Claude Code
 */
export function generateFixPrompt(errors: BuildError[]): string {
  if (errors.length === 0) return '';

  const errorList = errors
    .map((e, i) => `${i + 1}. [${e.type.toUpperCase()}] ${e.message}
   ${e.file ? `File: ${e.file}${e.line ? `:${e.line}` : ''}` : ''}
   Suggested fix: ${e.suggestedFix}`)
    .join('\n\n');

  return `The build encountered the following errors. Please fix them:

${errorList}

Apply the suggested fixes and verify the build succeeds.`;
}

/**
 * Check if output contains errors
 */
export function hasErrors(output: string): boolean {
  return ERROR_PATTERNS.some(pattern => pattern.pattern.test(output));
}

/**
 * Get error summary for display
 */
export function getErrorSummary(errors: BuildError[]): string {
  if (errors.length === 0) return 'No errors detected';

  const byType = errors.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<ErrorType, number>);

  const parts = Object.entries(byType)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');

  return `${errors.length} error(s): ${parts}`;
}

/**
 * Error tracker for learning from patterns
 */
export class ErrorTracker {
  private errors: Map<string, { error: BuildError; count: number; fixes: string[] }> = new Map();

  /**
   * Record an error
   */
  record(error: BuildError, wasFixed: boolean, fixApplied?: string): void {
    const key = `${error.type}:${error.code || error.message.slice(0, 50)}`;
    const existing = this.errors.get(key);

    if (existing) {
      existing.count++;
      if (wasFixed && fixApplied && !existing.fixes.includes(fixApplied)) {
        existing.fixes.push(fixApplied);
      }
    } else {
      this.errors.set(key, {
        error,
        count: 1,
        fixes: wasFixed && fixApplied ? [fixApplied] : [],
      });
    }
  }

  /**
   * Get most effective fix for an error type
   */
  getBestFix(error: BuildError): string | undefined {
    const key = `${error.type}:${error.code || error.message.slice(0, 50)}`;
    const existing = this.errors.get(key);
    return existing?.fixes[0];
  }

  /**
   * Get frequently occurring errors
   */
  getFrequentErrors(limit = 5): Array<{ error: BuildError; count: number }> {
    return Array.from(this.errors.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Export for persistence
   */
  export(): Record<string, { error: BuildError; count: number; fixes: string[] }> {
    return Object.fromEntries(this.errors);
  }

  /**
   * Import from persistence
   */
  import(data: Record<string, { error: BuildError; count: number; fixes: string[] }>): void {
    this.errors = new Map(Object.entries(data));
  }
}

// Singleton error tracker
let globalTracker: ErrorTracker | null = null;

export function getErrorTracker(): ErrorTracker {
  if (!globalTracker) {
    globalTracker = new ErrorTracker();
  }
  return globalTracker;
}
