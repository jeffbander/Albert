/**
 * NotebookLM Browser Controller
 * Automates NotebookLM operations using Playwright connected via CDP.
 * Connects to the user's existing Chrome browser for seamless integration.
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';

// Chrome debugging port (Chrome must be launched with --remote-debugging-port=9222)
const CHROME_DEBUG_PORT = process.env.CHROME_DEBUG_PORT || '9222';
const CDP_ENDPOINT = `http://127.0.0.1:${CHROME_DEBUG_PORT}`;

// Cache the browser connection
let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;

interface TabInfo {
  tabId: string;
  title: string;
  url: string;
  page: Page;
}

/**
 * Connect to existing Chrome browser via CDP
 */
async function connectToBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  try {
    // Connect to Chrome via CDP
    browserInstance = await chromium.connectOverCDP(CDP_ENDPOINT, {
      timeout: 10000,
    });

    console.log('[NotebookLM] Connected to Chrome via CDP');
    return browserInstance;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Failed to connect to Chrome. Make sure Chrome is running with --remote-debugging-port=${CHROME_DEBUG_PORT}. Error: ${message}`
    );
  }
}

/**
 * Get or create a browser context
 */
async function getContext(): Promise<BrowserContext> {
  if (contextInstance) {
    return contextInstance;
  }

  const browser = await connectToBrowser();
  const contexts = browser.contexts();

  if (contexts.length > 0) {
    contextInstance = contexts[0];
  } else {
    contextInstance = await browser.newContext();
  }

  return contextInstance;
}

/**
 * Get all available tabs
 */
async function getAvailableTabs(): Promise<TabInfo[]> {
  const context = await getContext();
  const pages = context.pages();

  return pages.map((page, index) => ({
    tabId: `tab_${index}`,
    title: page.url().split('/').pop() || 'Untitled',
    url: page.url(),
    page,
  }));
}

/**
 * Initialize browser and get or create a tab for NotebookLM
 */
export async function initializeBrowser(): Promise<{ tabId: number; isNew: boolean }> {
  const context = await getContext();
  const pages = context.pages();

  // Look for an existing NotebookLM tab
  for (let i = 0; i < pages.length; i++) {
    const url = pages[i].url();
    if (url.includes('notebooklm.google.com')) {
      console.log('[NotebookLM] Found existing NotebookLM tab');
      return { tabId: i, isNew: false };
    }
  }

  // Create a new page if no NotebookLM tab exists
  const newPage = await context.newPage();
  const newIndex = context.pages().length - 1;

  console.log('[NotebookLM] Created new tab for NotebookLM');
  return { tabId: newIndex, isNew: true };
}

/**
 * Get page by tab index
 */
async function getPage(tabIndex: number): Promise<Page> {
  const context = await getContext();
  const pages = context.pages();

  if (tabIndex < 0 || tabIndex >= pages.length) {
    throw new Error(`Invalid tab index: ${tabIndex}. Available: ${pages.length} tabs`);
  }

  return pages[tabIndex];
}

/**
 * Navigate to NotebookLM
 */
export async function navigateToNotebookLM(tabId: number): Promise<void> {
  const page = await getPage(tabId);

  await page.goto('https://notebooklm.google.com/', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // Wait for page to be interactive
  await page.waitForTimeout(2000);

  console.log('[NotebookLM] Navigated to NotebookLM');
}

/**
 * Create a new notebook with a title
 */
export async function createNewNotebook(tabId: number, title: string): Promise<string> {
  const page = await getPage(tabId);

  // Wait for page to be ready
  await page.waitForTimeout(1000);

  // Find and click "Create notebook" button
  const createButton = await page.$('button:has-text("Create notebook")');
  if (createButton) {
    await createButton.click();
    await page.waitForTimeout(2000);
    console.log('[NotebookLM] Clicked Create notebook button');
  } else {
    // Try alternative selectors
    const newNotebookBtn = await page.$('[aria-label*="new notebook" i], [aria-label*="create notebook" i]');
    if (newNotebookBtn) {
      await newNotebookBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Wait for notebook to open and close any source dialog
  await page.waitForTimeout(2000);

  // Close the "Add sources" dialog if it appears
  const closeButton = await page.$('button[aria-label="Close dialog"], button:has-text("Close")');
  if (closeButton) {
    await closeButton.click();
    await page.waitForTimeout(500);
  }

  // Try to set the title
  try {
    // Click on the title area
    const titleInput = await page.$('input[type="text"], [contenteditable="true"]');
    if (titleInput) {
      await titleInput.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(title);
      await page.keyboard.press('Enter');
      console.log('[NotebookLM] Set notebook title');
    }
  } catch (e) {
    console.log('[NotebookLM] Could not set title, continuing...');
  }

  return page.url();
}

/**
 * Add a source to the current notebook
 */
export async function addSourceToNotebook(
  tabId: number,
  sourceType: 'url' | 'youtube' | 'google_doc' | 'text',
  content: string
): Promise<boolean> {
  const page = await getPage(tabId);

  // Find and click "Add sources" button
  let addSourceButton = await page.$('button:has-text("Add sources")');
  if (!addSourceButton) {
    addSourceButton = await page.$('[aria-label*="add source" i], button:has-text("Upload")');
  }

  if (addSourceButton) {
    await addSourceButton.click();
    await page.waitForTimeout(1000);
    console.log('[NotebookLM] Opened add source dialog');
  }

  // Handle URL/Website source type
  if (sourceType === 'url' || sourceType === 'youtube') {
    // Click on Website option
    const websiteOption = await page.$('button:has-text("Website"), [aria-label*="website" i]');
    if (websiteOption) {
      await websiteOption.click();
      await page.waitForTimeout(1000);
    }

    // Find URL input and enter the URL
    const urlInput = await page.$('textarea[placeholder*="URL" i], input[placeholder*="URL" i], textarea');
    if (urlInput) {
      await urlInput.click();
      await urlInput.fill(content);
      console.log('[NotebookLM] Entered URL');
    }

    // Click Insert button
    await page.waitForTimeout(500);
    const insertButton = await page.$('button:has-text("Insert")');
    if (insertButton) {
      await insertButton.click();
      await page.waitForTimeout(3000);
      console.log('[NotebookLM] Clicked Insert button');
    }
  } else if (sourceType === 'text') {
    // Click on "Copied text" or "Paste text" option
    const textOption = await page.$('button:has-text("Copied text"), button:has-text("Paste text")');
    if (textOption) {
      await textOption.click();
      await page.waitForTimeout(1000);
    }

    // Find text area and enter content
    const textArea = await page.$('textarea');
    if (textArea) {
      await textArea.fill(content);
    }

    // Click Insert
    const insertButton = await page.$('button:has-text("Insert")');
    if (insertButton) {
      await insertButton.click();
      await page.waitForTimeout(2000);
    }
  }

  return true;
}

/**
 * Ask NotebookLM a question and get the response
 */
export async function askNotebookQuestion(tabId: number, question: string): Promise<string> {
  const page = await getPage(tabId);

  // Find the chat input
  const chatInput = await page.$('textarea[placeholder*="typing" i], input[placeholder*="typing" i], [role="textbox"]');

  if (!chatInput) {
    throw new Error('Could not find chat input');
  }

  // Click to focus and type the question
  await chatInput.click();
  await chatInput.fill(question);

  console.log('[NotebookLM] Entered question');

  // Press Enter or click submit
  await page.keyboard.press('Enter');

  // Wait for response - poll until response appears or timeout
  console.log('[NotebookLM] Waiting for response...');

  let attempts = 0;
  const maxAttempts = 60;
  let lastContent = '';

  while (attempts < maxAttempts) {
    await page.waitForTimeout(1000);

    // Get the latest response text
    const responseElements = await page.$$('div[class*="response"], div[class*="answer"], div[class*="message"]');

    if (responseElements.length > 0) {
      const lastResponse = responseElements[responseElements.length - 1];
      const newContent = await lastResponse.textContent() || '';

      // If content stopped changing, response is likely complete
      if (newContent.length > 50 && newContent === lastContent) {
        console.log('[NotebookLM] Response received');
        return newContent.trim();
      }

      lastContent = newContent;
    }

    // Check if there's a loading indicator
    const loading = await page.$('[class*="loading"], [class*="spinner"], [aria-label*="loading" i]');
    if (!loading && lastContent.length > 50) {
      break;
    }

    attempts++;
  }

  // Try to get the response from the page text
  if (lastContent.length > 0) {
    return lastContent.trim();
  }

  // Fallback: get visible text from main content area
  const mainContent = await page.$eval('main, [role="main"], .chat-container',
    el => el.textContent || ''
  ).catch(() => '');

  if (mainContent.length > 100) {
    // Extract last substantial paragraph
    const paragraphs = mainContent.split('\n').filter(p => p.trim().length > 50);
    if (paragraphs.length > 0) {
      return paragraphs[paragraphs.length - 1].trim();
    }
  }

  return 'Response received but could not extract text. Please check the NotebookLM window.';
}

/**
 * Take a screenshot of the current page
 */
export async function takeScreenshot(tabId: number): Promise<string | null> {
  try {
    const page = await getPage(tabId);
    const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
    return buffer.toString('base64');
  } catch (error) {
    console.error('[NotebookLM] Screenshot failed:', error);
    return null;
  }
}

/**
 * Check if user is logged into NotebookLM
 */
export async function checkLoginStatus(tabId: number): Promise<boolean> {
  try {
    const page = await getPage(tabId);
    const content = await page.content();

    // Check for logged-in indicators
    const loggedInIndicators = ['Create notebook', 'New notebook', 'My notebooks', 'notebooklm.google.com/notebook'];

    for (const indicator of loggedInIndicators) {
      if (content.includes(indicator)) {
        return true;
      }
    }

    // Check for login page indicators
    const loginIndicators = ['Sign in', 'accounts.google.com'];

    for (const indicator of loginIndicators) {
      if (content.includes(indicator)) {
        return false;
      }
    }

    // Assume logged in if we're on NotebookLM domain
    const url = page.url();
    return url.includes('notebooklm.google.com');
  } catch (error) {
    console.error('[NotebookLM] Login check failed:', error);
    return false;
  }
}

/**
 * Close the browser connection (cleanup)
 */
export async function closeBrowserConnection(): Promise<void> {
  if (browserInstance) {
    // Don't close the browser, just disconnect
    browserInstance = null;
    contextInstance = null;
    console.log('[NotebookLM] Disconnected from browser');
  }
}

/**
 * Get the current page URL
 */
export async function getCurrentUrl(tabId: number): Promise<string> {
  const page = await getPage(tabId);
  return page.url();
}

/**
 * Scroll the page
 */
export async function scrollPage(tabId: number, direction: 'up' | 'down'): Promise<void> {
  const page = await getPage(tabId);
  const deltaY = direction === 'down' ? 300 : -300;
  await page.mouse.wheel(0, deltaY);
}
