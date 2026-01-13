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
