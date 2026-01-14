/**
 * Type-safe configuration loader for Albert Voice Assistant
 *
 * This module provides centralized access to all environment variables
 * with proper typing and validation.
 */

export type BrowserProvider = 'local-cdp' | 'browserbase';

export interface BrowserConfig {
  provider: BrowserProvider;
  cdpPort: string;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
}

export interface AuthConfig {
  secret?: string;
  url?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  githubClientId?: string;
  githubClientSecret?: string;
}

export interface GmailConfig {
  clientId?: string;
  clientSecret?: string;
  enabled: boolean;
}

export interface DatabaseConfig {
  url?: string;
  authToken?: string;
}

export interface AIConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  mem0ApiKey?: string;
  perplexityApiKey?: string;
}

export interface AppConfig {
  browser: BrowserConfig;
  auth: AuthConfig;
  gmail: GmailConfig;
  database: DatabaseConfig;
  ai: AIConfig;
  appUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

/**
 * Helper to trim environment variable values
 * Vercel CLI sometimes adds trailing newlines to env vars
 */
const trimEnv = (key: string): string | undefined => {
  return process.env[key]?.trim() || undefined;
};

/**
 * Centralized configuration object
 * Access environment variables through this object for type safety
 */
export const config: AppConfig = {
  browser: {
    provider: (trimEnv('BROWSER_PROVIDER') as BrowserProvider) || 'local-cdp',
    cdpPort: trimEnv('CHROME_DEBUG_PORT') || '9222',
    browserbaseApiKey: trimEnv('BROWSERBASE_API_KEY'),
    browserbaseProjectId: trimEnv('BROWSERBASE_PROJECT_ID'),
  },
  auth: {
    secret: trimEnv('NEXTAUTH_SECRET'),
    url: trimEnv('NEXTAUTH_URL'),
    googleClientId: trimEnv('GOOGLE_CLIENT_ID'),
    googleClientSecret: trimEnv('GOOGLE_CLIENT_SECRET'),
    githubClientId: trimEnv('GITHUB_CLIENT_ID'),
    githubClientSecret: trimEnv('GITHUB_CLIENT_SECRET'),
  },
  gmail: {
    clientId: trimEnv('GMAIL_CLIENT_ID'),
    clientSecret: trimEnv('GMAIL_CLIENT_SECRET'),
    enabled: trimEnv('GMAIL_ENABLED') === 'true',
  },
  database: {
    url: trimEnv('TURSO_DATABASE_URL'),
    authToken: trimEnv('TURSO_AUTH_TOKEN'),
  },
  ai: {
    openaiApiKey: trimEnv('OPENAI_API_KEY'),
    anthropicApiKey: trimEnv('ANTHROPIC_API_KEY'),
    mem0ApiKey: trimEnv('MEM0_API_KEY'),
    perplexityApiKey: trimEnv('PERPLEXITY_API_KEY'),
  },
  appUrl: trimEnv('APP_URL') || trimEnv('NEXTAUTH_URL') || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',
};

/**
 * Required environment variables for the application to function
 */
const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
] as const;

/**
 * Required environment variables for production deployment
 */
const PRODUCTION_REQUIRED_ENV_VARS = [
  ...REQUIRED_ENV_VARS,
  'NEXTAUTH_SECRET',
  'TURSO_DATABASE_URL',
] as const;

/**
 * Required environment variables for Browserbase provider
 */
const BROWSERBASE_REQUIRED_ENV_VARS = [
  'BROWSERBASE_API_KEY',
  'BROWSERBASE_PROJECT_ID',
] as const;

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates that all required environment variables are set
 * Throws an error if any required variables are missing
 */
export function validateConfig(): void {
  const result = getValidationResult();

  if (!result.valid) {
    throw new Error(
      `Missing required environment variables: ${result.missing.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }

  if (result.warnings.length > 0) {
    console.warn('Configuration warnings:', result.warnings.join(', '));
  }
}

/**
 * Gets detailed validation results without throwing
 * Useful for displaying configuration status in admin panels
 */
export function getValidationResult(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check base required variables
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Check production-specific requirements
  if (config.isProduction) {
    for (const key of PRODUCTION_REQUIRED_ENV_VARS) {
      if (!process.env[key] && !missing.includes(key)) {
        missing.push(key);
      }
    }
  }

  // Check Browserbase requirements if using that provider
  if (config.browser.provider === 'browserbase') {
    for (const key of BROWSERBASE_REQUIRED_ENV_VARS) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }

  // Add warnings for recommended but optional variables
  if (!config.database.url) {
    warnings.push('TURSO_DATABASE_URL not set - database features will be disabled');
  }

  if (!config.ai.mem0ApiKey) {
    warnings.push('MEM0_API_KEY not set - persistent memory disabled');
  }

  if (config.isProduction && config.browser.provider === 'local-cdp') {
    warnings.push('Using local-cdp browser provider in production - consider using browserbase');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Helper to check if a specific feature is available based on configuration
 */
export const features = {
  database: () => Boolean(config.database.url),
  gmail: () => config.gmail.enabled && Boolean(config.gmail.clientId),
  memory: () => Boolean(config.ai.mem0ApiKey),
  research: () => Boolean(config.ai.perplexityApiKey),
  browserAutomation: () => {
    if (config.browser.provider === 'browserbase') {
      return Boolean(config.browser.browserbaseApiKey && config.browser.browserbaseProjectId);
    }
    return true; // local-cdp is always "available" (though Chrome must be running)
  },
  googleAuth: () => Boolean(config.auth.googleClientId && config.auth.googleClientSecret),
  githubAuth: () => Boolean(config.auth.githubClientId && config.auth.githubClientSecret),
};

/**
 * Get the browser connection URL based on provider configuration
 */
export function getBrowserConnectionUrl(): string {
  if (config.browser.provider === 'browserbase') {
    return `wss://connect.browserbase.com?apiKey=${config.browser.browserbaseApiKey}&projectId=${config.browser.browserbaseProjectId}`;
  }
  return `http://localhost:${config.browser.cdpPort}`;
}

export default config;
