/**
 * Browserbase Cloud Provider
 * Connects to Browserbase cloud browser service for remote browser automation.
 * Useful for production deployments where local Chrome is not available.
 *
 * @see https://www.browserbase.com/docs
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
 * Browserbase Cloud Provider Implementation
 */
export class BrowserbaseProvider implements BrowserProvider {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserProviderConfig;
  private debug: boolean;
  private sessionId: string | null = null;

  constructor(config: BrowserProviderConfig) {
    this.config = config;
    this.debug = config.debug ?? false;

    if (!config.apiKey) {
      throw new BrowserProviderError(
        'Browserbase API key is required. Set BROWSERBASE_API_KEY environment variable.',
        'AUTHENTICATION_REQUIRED'
      );
    }
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[BrowserbaseProvider] ${message}`, ...args);
    }
  }

  private get apiKey(): string {
    return this.config.apiKey || process.env.BROWSERBASE_API_KEY || '';
  }

  private get projectId(): string | undefined {
    return this.config.projectId || process.env.BROWSERBASE_PROJECT_ID;
  }

  async connect(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      this.log('Already connected');
      return;
    }

    try {
      this.log('Creating Browserbase session...');

      // Create a new session via Browserbase API
      const sessionResponse = await fetch('https://www.browserbase.com/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bb-api-key': this.apiKey,
        },
        body: JSON.stringify({
          projectId: this.projectId,
          browserSettings: {
            fingerprint: {
              devices: ['desktop'],
              operatingSystems: ['windows', 'macos'],
            },
          },
        }),
      });

      if (!sessionResponse.ok) {
        const error = await sessionResponse.text();
        throw new Error(`Failed to create Browserbase session: ${error}`);
      }

      const sessionData = await sessionResponse.json();
      this.sessionId = sessionData.id;

      this.log('Session created:', this.sessionId);

      // Connect to the session via CDP
      const wsUrl = `wss://connect.browserbase.com?apiKey=${this.apiKey}&sessionId=${this.sessionId}`;

      this.browser = await chromium.connectOverCDP(wsUrl, {
        timeout: this.config.connectionTimeout || 30000,
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

      this.log('Connected to Browserbase successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      throw new BrowserProviderError(
        `Failed to connect to Browserbase: ${message}`,
        'CONNECTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Close the session via Browserbase API
      if (this.sessionId) {
        await fetch(`https://www.browserbase.com/v1/sessions/${this.sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bb-api-key': this.apiKey,
          },
          body: JSON.stringify({
            status: 'REQUEST_RELEASE',
          }),
        });
        this.log('Session released:', this.sessionId);
      }
    } catch (error) {
      this.log('Error releasing session:', error);
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
      this.sessionId = null;
    }
  }

  isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
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
  }

  async click(selector: string): Promise<void> {
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
  }

  async type(selector: string, text: string): Promise<void> {
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
  }

  async fill(selector: string, text: string): Promise<void> {
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
  }

  async pressKey(key: string): Promise<void> {
    const page = this.getPage();
    this.log('Pressing key', key);
    await page.keyboard.press(key);
  }

  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
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
  }

  async getPageContent(): Promise<string> {
    const page = this.getPage();
    return page.content();
  }

  async waitForSelector(selector: string, timeout = 30000): Promise<void> {
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
  }

  async waitForTimeout(ms: number): Promise<void> {
    const page = this.getPage();
    await page.waitForTimeout(ms);
  }

  async evaluate<T>(fn: string | (() => T)): Promise<T> {
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
  }

  async getCurrentUrl(): Promise<string> {
    const page = this.getPage();
    return page.url();
  }

  async querySelector(selector: string): Promise<ElementHandle | null> {
    const page = this.getPage();
    const element = await page.$(selector);

    if (!element) {
      return null;
    }

    return new PlaywrightElementWrapper(element);
  }

  async querySelectorAll(selector: string): Promise<ElementHandle[]> {
    const page = this.getPage();
    const elements = await page.$$(selector);

    return elements.map(el => new PlaywrightElementWrapper(el));
  }

  async scroll(deltaX: number, deltaY: number): Promise<void> {
    const page = this.getPage();
    await page.mouse.wheel(deltaX, deltaY);
  }

  async getTextContent(selector: string): Promise<string | null> {
    const page = this.getPage();

    try {
      return await page.$eval(selector, el => el.textContent || null);
    } catch {
      return null;
    }
  }

  /**
   * Get the underlying Playwright page for advanced operations
   */
  getPlaywrightPage(): Page | null {
    return this.page;
  }

  /**
   * Get or create a page (Browserbase typically works with a single page)
   */
  async getOrCreateTab(targetUrl?: string): Promise<{ tabIndex: number; isNew: boolean }> {
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
  }

  /**
   * Switch to a specific tab by index
   */
  async switchToTab(tabIndex: number): Promise<void> {
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
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}
