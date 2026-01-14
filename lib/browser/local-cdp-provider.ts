/**
 * Local CDP Browser Provider
 * Connects to Chrome via Chrome DevTools Protocol for local browser automation.
 * Requires Chrome to be running with --remote-debugging-port flag.
 *
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Graceful handling of Chrome restarts
 * - Connection health monitoring
 */

import { chromium, Browser, Page, BrowserContext, ElementHandle as PlaywrightElementHandle } from 'playwright';
import type {
  BrowserProvider,
  BrowserProviderConfig,
  ElementHandle,
  NavigationOptions,
  ScreenshotOptions,
} from './types';
import { BrowserProviderError } from './types';

// Auto-reconnection configuration
const RECONNECT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
} as const;

/**
 * Wrapper for Playwright ElementHandle to match our interface
 */
class PlaywrightElementWrapper implements ElementHandle {
  constructor(private element: PlaywrightElementHandle) {}

  async click(): Promise<void> {
    await this.element.click();
  }

  async type(text: string): Promise<void> {
    await this.element.type(text);
  }

  async fill(text: string): Promise<void> {
    await this.element.fill(text);
  }

  async textContent(): Promise<string | null> {
    return this.element.textContent();
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.element.getAttribute(name);
  }

  async isVisible(): Promise<boolean> {
    return this.element.isVisible();
  }
}

/**
 * Local CDP Browser Provider Implementation
 */
export class LocalCDPProvider implements BrowserProvider {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserProviderConfig;
  private debug: boolean;
  private reconnectAttempts: number = 0;
  private lastConnectionAttempt: number = 0;

  constructor(config: BrowserProviderConfig) {
    this.config = config;
    this.debug = config.debug ?? false;
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[LocalCDPProvider] ${message}`, ...args);
    }
  }

  private get cdpEndpoint(): string {
    if (this.config.cdpEndpoint) {
      return this.config.cdpEndpoint;
    }
    const port = this.config.debugPort || process.env.CHROME_DEBUG_PORT || '9222';
    return `http://127.0.0.1:${port}`;
  }

  async connect(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      this.log('Already connected');
      return;
    }

    const timeout = this.config.connectionTimeout || 10000;

    try {
      this.log('Connecting to Chrome via CDP at', this.cdpEndpoint);

      this.browser = await chromium.connectOverCDP(this.cdpEndpoint, {
        timeout,
      });

      // Get or create context
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
      } else {
        this.context = await this.browser.newContext();
      }

      // Get or create page
      const pages = this.context.pages();
      if (pages.length > 0) {
        this.page = pages[0];
      } else {
        this.page = await this.context.newPage();
      }

      this.log('Connected successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      throw new BrowserProviderError(
        `Failed to connect to Chrome. Make sure Chrome is running with --remote-debugging-port=${this.config.debugPort || 9222}. Error: ${message}`,
        'CONNECTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    // Don't close the browser, just clear references
    this.browser = null;
    this.context = null;
    this.page = null;
    this.log('Disconnected');
  }

  isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Ensure connection is active, reconnecting if necessary.
   * Uses exponential backoff for retry attempts.
   *
   * @throws BrowserProviderError if connection cannot be established after retries
   */
  async ensureConnected(): Promise<void> {
    // Already connected
    if (this.isConnected()) {
      this.reconnectAttempts = 0;
      return;
    }

    this.log('Connection lost, attempting to reconnect...');

    for (let attempt = 1; attempt <= RECONNECT_CONFIG.maxRetries; attempt++) {
      try {
        // Calculate delay with exponential backoff
        const delay = Math.min(
          RECONNECT_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
          RECONNECT_CONFIG.maxDelayMs
        );

        // Wait before retry (except first attempt)
        if (attempt > 1) {
          this.log(`Retry ${attempt}/${RECONNECT_CONFIG.maxRetries} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Clear stale references
        this.browser = null;
        this.context = null;
        this.page = null;
        this.lastConnectionAttempt = Date.now();

        // Attempt reconnection
        await this.connect();

        this.log(`Reconnected successfully on attempt ${attempt}`);
        this.reconnectAttempts = 0;
        return;
      } catch (error) {
        this.reconnectAttempts = attempt;
        this.log(`Reconnection attempt ${attempt} failed:`, error);

        if (attempt === RECONNECT_CONFIG.maxRetries) {
          throw new BrowserProviderError(
            `Failed to reconnect to Chrome after ${RECONNECT_CONFIG.maxRetries} attempts. Please ensure Chrome is running with --remote-debugging-port=${this.config.debugPort || 9222}`,
            'CONNECTION_FAILED',
            error instanceof Error ? error : undefined
          );
        }
      }
    }
  }

  /**
   * Wrap an operation with auto-reconnection logic.
   * If the operation fails due to connection issues, it will attempt to reconnect and retry.
   *
   * @param operation - The async operation to execute
   * @param operationName - Name for logging purposes
   * @returns The result of the operation
   */
  async withAutoReconnect<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    try {
      // Ensure we're connected before the operation
      await this.ensureConnected();
      return await operation();
    } catch (error) {
      // Check if this is a connection-related error
      const isConnectionError =
        error instanceof BrowserProviderError &&
        (error.code === 'NOT_CONNECTED' || error.code === 'CONNECTION_FAILED');

      const isPlaywrightDisconnect =
        error instanceof Error &&
        (error.message.includes('Target page, context or browser has been closed') ||
          error.message.includes('Protocol error') ||
          error.message.includes('Target closed') ||
          error.message.includes('Connection closed'));

      if (isConnectionError || isPlaywrightDisconnect) {
        this.log(`${operationName} failed due to connection issue, attempting reconnect...`);

        // Clear stale connection
        this.browser = null;
        this.context = null;
        this.page = null;

        // Try to reconnect and retry the operation once
        try {
          await this.ensureConnected();
          this.log(`Retrying ${operationName} after reconnection...`);
          return await operation();
        } catch (retryError) {
          throw new BrowserProviderError(
            `${operationName} failed after reconnection attempt: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`,
            'CONNECTION_FAILED',
            retryError instanceof Error ? retryError : undefined
          );
        }
      }

      // Re-throw non-connection errors
      throw error;
    }
  }

  /**
   * Check if Chrome is available at the debug port.
   * Useful for health checks before attempting operations.
   */
  async checkChromeAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.cdpEndpoint}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get connection status details for debugging/monitoring.
   */
  getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    lastConnectionAttempt: number;
    endpoint: string;
  } {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      lastConnectionAttempt: this.lastConnectionAttempt,
      endpoint: this.cdpEndpoint,
    };
  }

  private getPage(): Page {
    if (!this.page) {
      throw new BrowserProviderError(
        'Not connected to browser. Call connect() first.',
        'NOT_CONNECTED'
      );
    }
    return this.page;
  }

  async navigateTo(url: string, options?: NavigationOptions): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();

      this.log('Navigating to', url);

      try {
        await page.goto(url, {
          waitUntil: options?.waitUntil || 'networkidle',
          timeout: options?.timeout || 30000,
        });
      } catch (error) {
        throw new BrowserProviderError(
          `Navigation to ${url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'NAVIGATION_FAILED',
          error instanceof Error ? error : undefined
        );
      }
    }, 'navigateTo');
  }

  async click(selector: string): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      this.log('Clicking', selector);

      const element = await page.$(selector);
      if (!element) {
        throw new BrowserProviderError(
          `Element not found: ${selector}`,
          'SELECTOR_NOT_FOUND'
        );
      }

      await element.click();
    }, 'click');
  }

  async type(selector: string, text: string): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      this.log('Typing into', selector);

      const element = await page.$(selector);
      if (!element) {
        throw new BrowserProviderError(
          `Element not found: ${selector}`,
          'SELECTOR_NOT_FOUND'
        );
      }

      await element.type(text);
    }, 'type');
  }

  async fill(selector: string, text: string): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      this.log('Filling', selector);

      const element = await page.$(selector);
      if (!element) {
        throw new BrowserProviderError(
          `Element not found: ${selector}`,
          'SELECTOR_NOT_FOUND'
        );
      }

      await element.fill(text);
    }, 'fill');
  }

  async pressKey(key: string): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      this.log('Pressing key', key);
      await page.keyboard.press(key);
    }, 'pressKey');
  }

  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      this.log('Taking screenshot');

      try {
        return await page.screenshot({
          type: options?.type || 'jpeg',
          quality: options?.quality ?? 80,
          fullPage: options?.fullPage ?? false,
        });
      } catch (error) {
        throw new BrowserProviderError(
          `Screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'SCREENSHOT_FAILED',
          error instanceof Error ? error : undefined
        );
      }
    }, 'screenshot');
  }

  async getPageContent(): Promise<string> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      return page.content();
    }, 'getPageContent');
  }

  async waitForSelector(selector: string, timeout = 30000): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      this.log('Waiting for selector', selector);

      try {
        await page.waitForSelector(selector, { timeout });
      } catch (error) {
        throw new BrowserProviderError(
          `Timeout waiting for selector: ${selector}`,
          'SELECTOR_NOT_FOUND',
          error instanceof Error ? error : undefined
        );
      }
    }, 'waitForSelector');
  }

  async waitForTimeout(ms: number): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      await page.waitForTimeout(ms);
    }, 'waitForTimeout');
  }

  async evaluate<T>(fn: string | (() => T)): Promise<T> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();

      try {
        if (typeof fn === 'string') {
          return await page.evaluate(fn) as T;
        }
        return await page.evaluate(fn);
      } catch (error) {
        throw new BrowserProviderError(
          `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'EVALUATION_ERROR',
          error instanceof Error ? error : undefined
        );
      }
    }, 'evaluate');
  }

  async getCurrentUrl(): Promise<string> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      return page.url();
    }, 'getCurrentUrl');
  }

  async querySelector(selector: string): Promise<ElementHandle | null> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      const element = await page.$(selector);

      if (!element) {
        return null;
      }

      return new PlaywrightElementWrapper(element);
    }, 'querySelector');
  }

  async querySelectorAll(selector: string): Promise<ElementHandle[]> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      const elements = await page.$$(selector);

      return elements.map(el => new PlaywrightElementWrapper(el));
    }, 'querySelectorAll');
  }

  async scroll(deltaX: number, deltaY: number): Promise<void> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();
      await page.mouse.wheel(deltaX, deltaY);
    }, 'scroll');
  }

  async getTextContent(selector: string): Promise<string | null> {
    return this.withAutoReconnect(async () => {
      const page = this.getPage();

      try {
        return await page.$eval(selector, el => el.textContent || null);
      } catch {
        return null;
      }
    }, 'getTextContent');
  }

  /**
   * Get the underlying Playwright page for advanced operations
   * This is exposed for NotebookLM-specific workflows that need direct page access
   */
  getPlaywrightPage(): Page | null {
    return this.page;
  }

  /**
   * Get or create a page at a specific tab index
   * Used for NotebookLM which may work with multiple tabs
   */
  async getOrCreateTab(targetUrl?: string): Promise<{ tabIndex: number; isNew: boolean }> {
    return this.withAutoReconnect(async () => {
      if (!this.context) {
        throw new BrowserProviderError(
          'Not connected to browser. Call connect() first.',
          'NOT_CONNECTED'
        );
      }

      const pages = this.context.pages();

      // Look for existing tab with target URL
      if (targetUrl) {
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].url().includes(targetUrl)) {
            this.page = pages[i];
            this.log('Found existing tab at index', i);
            return { tabIndex: i, isNew: false };
          }
        }
      }

      // Create new page
      const newPage = await this.context.newPage();
      this.page = newPage;
      const newIndex = this.context.pages().length - 1;

      this.log('Created new tab at index', newIndex);
      return { tabIndex: newIndex, isNew: true };
    }, 'getOrCreateTab');
  }

  /**
   * Switch to a specific tab by index
   */
  async switchToTab(tabIndex: number): Promise<void> {
    return this.withAutoReconnect(async () => {
      if (!this.context) {
        throw new BrowserProviderError(
          'Not connected to browser. Call connect() first.',
          'NOT_CONNECTED'
        );
      }

      const pages = this.context.pages();

      if (tabIndex < 0 || tabIndex >= pages.length) {
        throw new BrowserProviderError(
          `Invalid tab index: ${tabIndex}. Available: ${pages.length} tabs`,
          'SELECTOR_NOT_FOUND'
        );
      }

      this.page = pages[tabIndex];
      this.log('Switched to tab', tabIndex);
    }, 'switchToTab');
  }
}
