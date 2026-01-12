/**
 * Browser Provider Types
 * Abstraction layer for browser automation to support both local CDP and cloud providers.
 */

/**
 * Main browser provider interface that abstracts browser automation operations.
 * Implementations can use local Chrome via CDP or cloud providers like Browserbase.
 */
export interface BrowserProvider {
  /**
   * Connect to the browser
   * @throws BrowserProviderError if connection fails
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the browser
   */
  disconnect(): Promise<void>;

  /**
   * Navigate to a URL
   * @param url - The URL to navigate to
   * @param options - Navigation options
   */
  navigateTo(url: string, options?: NavigationOptions): Promise<void>;

  /**
   * Click on an element
   * @param selector - CSS selector for the element
   */
  click(selector: string): Promise<void>;

  /**
   * Type text into an element
   * @param selector - CSS selector for the input element
   * @param text - Text to type
   */
  type(selector: string, text: string): Promise<void>;

  /**
   * Fill an input field (clears existing content first)
   * @param selector - CSS selector for the input element
   * @param text - Text to fill
   */
  fill(selector: string, text: string): Promise<void>;

  /**
   * Press a keyboard key
   * @param key - Key to press (e.g., 'Enter', 'Tab', 'Escape', 'Control+a')
   */
  pressKey(key: string): Promise<void>;

  /**
   * Take a screenshot of the page
   * @param options - Screenshot options
   * @returns Screenshot buffer
   */
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;

  /**
   * Get the page's HTML content
   * @returns The full HTML content of the page
   */
  getPageContent(): Promise<string>;

  /**
   * Wait for a selector to appear
   * @param selector - CSS selector to wait for
   * @param timeout - Timeout in milliseconds (default: 30000)
   */
  waitForSelector(selector: string, timeout?: number): Promise<void>;

  /**
   * Wait for a specified amount of time
   * @param ms - Milliseconds to wait
   */
  waitForTimeout(ms: number): Promise<void>;

  /**
   * Execute JavaScript in the page context
   * @param fn - JavaScript code to execute (as string or function)
   * @returns Result of the evaluation
   */
  evaluate<T>(fn: string | (() => T)): Promise<T>;

  /**
   * Get the current page URL
   * @returns Current URL
   */
  getCurrentUrl(): Promise<string>;

  /**
   * Check if connected to the browser
   * @returns True if connected
   */
  isConnected(): boolean;

  /**
   * Find an element by selector (returns null if not found)
   * @param selector - CSS selector
   * @returns Element handle or null
   */
  querySelector(selector: string): Promise<ElementHandle | null>;

  /**
   * Find all elements matching a selector
   * @param selector - CSS selector
   * @returns Array of element handles
   */
  querySelectorAll(selector: string): Promise<ElementHandle[]>;

  /**
   * Scroll the page
   * @param deltaX - Horizontal scroll amount
   * @param deltaY - Vertical scroll amount
   */
  scroll(deltaX: number, deltaY: number): Promise<void>;

  /**
   * Get text content of an element
   * @param selector - CSS selector
   * @returns Text content or null if element not found
   */
  getTextContent(selector: string): Promise<string | null>;
}

/**
 * Element handle interface for interacting with page elements
 */
export interface ElementHandle {
  click(): Promise<void>;
  type(text: string): Promise<void>;
  fill(text: string): Promise<void>;
  textContent(): Promise<string | null>;
  getAttribute(name: string): Promise<string | null>;
  isVisible(): Promise<boolean>;
}

/**
 * Navigation options
 */
export interface NavigationOptions {
  /** Wait until condition */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Navigation timeout in milliseconds */
  timeout?: number;
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  /** Screenshot format */
  type?: 'jpeg' | 'png';
  /** JPEG quality (0-100) */
  quality?: number;
  /** Capture full page */
  fullPage?: boolean;
}

/**
 * Browser provider configuration
 */
export interface BrowserProviderConfig {
  /**
   * Type of browser provider to use
   */
  type: 'local-cdp' | 'browserbase' | 'browserless';

  /**
   * CDP endpoint for local connections (default: http://127.0.0.1:9222)
   */
  cdpEndpoint?: string;

  /**
   * Chrome debugging port for local connections (default: 9222)
   */
  debugPort?: number;

  /**
   * API key for cloud providers (e.g., Browserbase)
   */
  apiKey?: string;

  /**
   * Project ID for cloud providers
   */
  projectId?: string;

  /**
   * Session ID for resuming existing sessions
   */
  sessionId?: string;

  /**
   * Connection timeout in milliseconds
   */
  connectionTimeout?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Viewport width
   */
  viewportWidth?: number;

  /**
   * Viewport height
   */
  viewportHeight?: number;
}

/**
 * Browser provider error types
 */
export class BrowserProviderError extends Error {
  constructor(
    message: string,
    public readonly code: BrowserErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BrowserProviderError';
  }
}

export type BrowserErrorCode =
  | 'CONNECTION_FAILED'
  | 'CONNECTION_TIMEOUT'
  | 'NOT_CONNECTED'
  | 'NAVIGATION_FAILED'
  | 'SELECTOR_NOT_FOUND'
  | 'ELEMENT_NOT_VISIBLE'
  | 'EVALUATION_ERROR'
  | 'SCREENSHOT_FAILED'
  | 'PROVIDER_NOT_AVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'UNKNOWN_ERROR';

/**
 * Browser provider factory function type
 */
export type BrowserProviderFactory = (config: BrowserProviderConfig) => BrowserProvider;

/**
 * Logger interface for browser providers
 */
export interface BrowserLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Create a default logger with a prefix
 * @param prefix - Log message prefix
 * @param debug - Enable debug logging
 */
export function createLogger(prefix: string, debug: boolean = false): BrowserLogger {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (debug) console.log(`[${prefix}] DEBUG:`, message, ...args);
    },
    info: (message: string, ...args: unknown[]) => {
      console.log(`[${prefix}]`, message, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      console.warn(`[${prefix}] WARN:`, message, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      console.error(`[${prefix}] ERROR:`, message, ...args);
    },
  };
}
