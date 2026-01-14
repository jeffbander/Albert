/**
 * Browser Provider Module
 * Factory and exports for browser automation abstraction layer.
 */

import type { BrowserProvider, BrowserProviderConfig } from './types';
import { BrowserProviderError } from './types';
import { LocalCDPProvider } from './local-cdp-provider';
import { BrowserbaseProvider } from './browserbase-provider';

// Re-export types
export * from './types';
export { LocalCDPProvider } from './local-cdp-provider';
export { BrowserbaseProvider } from './browserbase-provider';

/**
 * Create a browser provider based on configuration.
 *
 * @param config - Provider configuration
 * @returns Browser provider instance
 *
 * @example
 * ```typescript
 * // Local CDP connection
 * const provider = createBrowserProvider({
 *   type: 'local-cdp',
 *   debugPort: 9222,
 * });
 *
 * // Cloud provider (Browserbase)
 * const cloudProvider = createBrowserProvider({
 *   type: 'browserbase',
 *   apiKey: process.env.BROWSERBASE_API_KEY,
 * });
 * ```
 */
export function createBrowserProvider(config: BrowserProviderConfig): BrowserProvider {
  switch (config.type) {
    case 'local-cdp':
      return new LocalCDPProvider(config);

    case 'browserbase':
      return new BrowserbaseProvider(config);

    case 'browserless':
      // Browserless support coming soon
      throw new BrowserProviderError(
        'Browserless provider is not yet implemented. Please use local-cdp or browserbase.',
        'PROVIDER_NOT_AVAILABLE'
      );

    default:
      throw new BrowserProviderError(
        `Unknown browser provider type: ${config.type}. Supported types: local-cdp, browserbase`,
        'PROVIDER_NOT_AVAILABLE'
      );
  }
}

/**
 * Create a browser provider from environment configuration.
 * Automatically selects the appropriate provider based on available environment variables.
 *
 * Environment variables:
 * - BROWSER_PROVIDER: Provider type ('local-cdp' | 'browserbase' | 'cloud')
 * - CHROME_DEBUG_PORT: Port for local CDP connection (default: 9222)
 * - BROWSERBASE_API_KEY: API key for Browserbase
 * - BROWSERBASE_PROJECT_ID: Project ID for Browserbase
 *
 * @returns Browser provider instance
 */
export function createBrowserProviderFromEnv(): BrowserProvider {
  // Trim env vars to remove trailing newlines/whitespace (Vercel CLI issue)
  const providerType = (process.env.BROWSER_PROVIDER?.trim() || 'local-cdp') as BrowserProviderConfig['type'];

  const config: BrowserProviderConfig = {
    type: providerType,
    debugPort: parseInt(process.env.CHROME_DEBUG_PORT?.trim() || '9222', 10),
    apiKey: process.env.BROWSERBASE_API_KEY?.trim(),
    projectId: process.env.BROWSERBASE_PROJECT_ID?.trim(),
    debug: process.env.BROWSER_DEBUG?.trim() === 'true',
  };

  return createBrowserProvider(config);
}

/**
 * Try to create a browser provider with fallback.
 * Attempts cloud provider first if configured, falls back to local CDP.
 *
 * @param preferCloud - Prefer cloud provider if available
 * @returns Browser provider instance
 */
export async function createBrowserProviderWithFallback(
  preferCloud = false
): Promise<BrowserProvider> {
  const hasCloudConfig = !!process.env.BROWSERBASE_API_KEY?.trim();
  const debugPort = parseInt(process.env.CHROME_DEBUG_PORT?.trim() || '9222', 10);
  const debug = process.env.BROWSER_DEBUG?.trim() === 'true';

  // Try cloud first if preferred and configured
  if (preferCloud && hasCloudConfig) {
    try {
      const cloudProvider = new BrowserbaseProvider({
        type: 'browserbase',
        apiKey: process.env.BROWSERBASE_API_KEY?.trim(),
        projectId: process.env.BROWSERBASE_PROJECT_ID?.trim(),
        debug,
      });

      await cloudProvider.connect();
      console.log('[BrowserProvider] Connected to cloud provider (Browserbase)');
      return cloudProvider;
    } catch (error) {
      console.warn('[BrowserProvider] Cloud provider unavailable, falling back to local:', error);
    }
  }

  // Try local CDP
  try {
    const localProvider = new LocalCDPProvider({
      type: 'local-cdp',
      debugPort,
      debug,
    });

    await localProvider.connect();
    console.log('[BrowserProvider] Connected to local Chrome via CDP');
    return localProvider;
  } catch (error) {
    // If local fails and cloud is available, try cloud as fallback
    if (hasCloudConfig && !preferCloud) {
      try {
        const cloudProvider = new BrowserbaseProvider({
          type: 'browserbase',
          apiKey: process.env.BROWSERBASE_API_KEY?.trim(),
          projectId: process.env.BROWSERBASE_PROJECT_ID?.trim(),
          debug,
        });

        await cloudProvider.connect();
        console.log('[BrowserProvider] Local unavailable, connected to cloud provider');
        return cloudProvider;
      } catch (cloudError) {
        console.error('[BrowserProvider] Both local and cloud providers failed');
      }
    }

    throw new BrowserProviderError(
      'No browser provider available. Either start Chrome with --remote-debugging-port=9222 or configure BROWSERBASE_API_KEY.',
      'PROVIDER_NOT_AVAILABLE',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Extended interface for providers that support tab management
 */
export interface TabAwareBrowserProvider extends BrowserProvider {
  getOrCreateTab(targetUrl?: string): Promise<{ tabIndex: number; isNew: boolean }>;
  switchToTab(tabIndex: number): Promise<void>;
}

/**
 * Check if a provider supports tab management
 */
export function isTabAwareProvider(provider: BrowserProvider): provider is TabAwareBrowserProvider {
  return 'getOrCreateTab' in provider && 'switchToTab' in provider;
}

/**
 * Check if local Chrome CDP is available.
 * Attempts to connect to local Chrome at the specified port.
 *
 * @param port - Chrome debugging port (default: 9222)
 * @returns True if Chrome is available
 */
export async function isLocalChromeAvailable(port: number = 9222): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get browser provider status information.
 * Returns information about available providers and their configuration.
 *
 * @returns Provider status object
 */
export async function getBrowserProviderStatus(): Promise<{
  localCdpAvailable: boolean;
  browserbaseConfigured: boolean;
  recommendedProvider: BrowserProviderConfig['type'];
  chromeDebugPort: number;
}> {
  const chromeDebugPort = parseInt(process.env.CHROME_DEBUG_PORT?.trim() || '9222', 10);
  const localCdpAvailable = await isLocalChromeAvailable(chromeDebugPort);
  const browserbaseConfigured = !!process.env.BROWSERBASE_API_KEY?.trim();

  let recommendedProvider: BrowserProviderConfig['type'] = 'local-cdp';
  if (browserbaseConfigured && !localCdpAvailable) {
    recommendedProvider = 'browserbase';
  } else if (localCdpAvailable) {
    recommendedProvider = 'local-cdp';
  } else if (browserbaseConfigured) {
    recommendedProvider = 'browserbase';
  }

  return {
    localCdpAvailable,
    browserbaseConfigured,
    recommendedProvider,
    chromeDebugPort,
  };
}

/**
 * Detect the best available browser provider type.
 *
 * @returns Recommended provider type based on environment
 */
export function detectBestProvider(): BrowserProviderConfig['type'] {
  if (process.env.BROWSERBASE_API_KEY?.trim()) {
    return 'browserbase';
  }
  return 'local-cdp';
}

// ============================================
// Browser Health Check System
// ============================================

interface BrowserHealthState {
  isHealthy: boolean;
  lastCheckTime: number;
  consecutiveFailures: number;
  provider: BrowserProviderConfig['type'] | null;
  errorMessage: string | null;
}

const healthState: BrowserHealthState = {
  isHealthy: false,
  lastCheckTime: 0,
  consecutiveFailures: 0,
  provider: null,
  errorMessage: null,
};

const HEALTH_CHECK_CACHE_MS = 10000; // Cache health check for 10 seconds
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Check browser automation availability with caching.
 * Returns cached result if checked within last 10 seconds.
 *
 * @param forceCheck - Bypass cache and perform fresh check
 * @returns Health check result
 */
export async function checkBrowserHealth(forceCheck = false): Promise<{
  isHealthy: boolean;
  provider: BrowserProviderConfig['type'] | null;
  errorMessage: string | null;
  voiceMessage: string;
}> {
  const now = Date.now();

  // Return cached result if recent and not forced
  if (!forceCheck && now - healthState.lastCheckTime < HEALTH_CHECK_CACHE_MS) {
    return {
      isHealthy: healthState.isHealthy,
      provider: healthState.provider,
      errorMessage: healthState.errorMessage,
      voiceMessage: healthState.isHealthy
        ? 'Browser is ready.'
        : healthState.errorMessage || 'Browser is not available.',
    };
  }

  // Check for cloud provider first
  const browserbaseConfigured = !!process.env.BROWSERBASE_API_KEY?.trim();

  if (browserbaseConfigured) {
    // Browserbase is configured - assume healthy (actual connection test happens on use)
    healthState.isHealthy = true;
    healthState.provider = 'browserbase';
    healthState.errorMessage = null;
    healthState.lastCheckTime = now;
    healthState.consecutiveFailures = 0;

    return {
      isHealthy: true,
      provider: 'browserbase',
      errorMessage: null,
      voiceMessage: 'Browser automation is ready using cloud provider.',
    };
  }

  // Check local Chrome availability
  const debugPort = parseInt(process.env.CHROME_DEBUG_PORT?.trim() || '9222', 10);
  const localAvailable = await isLocalChromeAvailable(debugPort);

  if (localAvailable) {
    healthState.isHealthy = true;
    healthState.provider = 'local-cdp';
    healthState.errorMessage = null;
    healthState.lastCheckTime = now;
    healthState.consecutiveFailures = 0;

    return {
      isHealthy: true,
      provider: 'local-cdp',
      errorMessage: null,
      voiceMessage: 'Browser is ready.',
    };
  }

  // No browser available
  healthState.isHealthy = false;
  healthState.provider = null;
  healthState.consecutiveFailures++;
  healthState.lastCheckTime = now;
  healthState.errorMessage = `Chrome is not running with debugging enabled on port ${debugPort}`;

  const voiceMessage = healthState.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
    ? 'Browser automation is not available. Please start Chrome with debugging enabled.'
    : 'I cannot access the browser right now. Please make sure Chrome is running.';

  return {
    isHealthy: false,
    provider: null,
    errorMessage: healthState.errorMessage,
    voiceMessage,
  };
}

/**
 * Report a browser operation failure.
 * Updates health state to track consecutive failures.
 */
export function reportBrowserFailure(error?: Error): void {
  healthState.consecutiveFailures++;
  healthState.lastCheckTime = 0; // Force fresh check on next request
  healthState.errorMessage = error?.message || 'Browser operation failed';

  if (healthState.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    healthState.isHealthy = false;
    console.warn(`[BrowserHealth] ${healthState.consecutiveFailures} consecutive failures, marking unhealthy`);
  }
}

/**
 * Report a successful browser operation.
 * Resets failure tracking.
 */
export function reportBrowserSuccess(): void {
  healthState.consecutiveFailures = 0;
  healthState.isHealthy = true;
  healthState.errorMessage = null;
}

/**
 * Get current health state (for monitoring/debugging).
 */
export function getBrowserHealthState(): Readonly<BrowserHealthState> {
  return { ...healthState };
}
