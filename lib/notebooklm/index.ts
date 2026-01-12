/**
 * NotebookLM Service
 * High-level service for NotebookLM operations using the browser provider abstraction.
 * This provides a clean interface for research operations without exposing browser implementation details.
 */

import type { BrowserProvider } from '@/lib/browser/types';
import { isTabAwareProvider } from '@/lib/browser';
import type { ResearchSession, ResearchSource } from '@/types/research';
import {
  createResearchSession,
  getResearchSession,
  updateSessionPhase,
  setSessionTabId,
  setSessionNotebookUrl,
  addSourceToSession,
  updateSourceStatus,
  recordQuestion,
  recordAnswer,
  closeResearchSession,
  // Sync versions for compatibility
  getResearchSessionSync,
} from '@/lib/researchSessionStore';

/**
 * Source input for adding to a notebook
 */
export interface SourceInput {
  type: 'url' | 'youtube' | 'google_doc' | 'text';
  content: string;
  description?: string;
}

/**
 * NotebookLM Service - encapsulates all NotebookLM research operations
 */
export class NotebookLMService {
  private browserProvider: BrowserProvider;
  private currentTabIndex: number = 0;
  private debug: boolean;

  constructor(browserProvider: BrowserProvider, options?: { debug?: boolean }) {
    this.browserProvider = browserProvider;
    this.debug = options?.debug ?? false;
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[NotebookLMService] ${message}`, ...args);
    }
  }

  /**
   * Start a new research session
   */
  async startResearch(
    userId: string,
    topic: string,
    initialSources?: string[]
  ): Promise<ResearchSession> {
    // Create session in store
    const sessionId = await createResearchSession(topic, userId);
    await updateSessionPhase(sessionId, 'initializing', `Starting research on "${topic}"...`);

    try {
      // Connect to browser
      await updateSessionPhase(sessionId, 'creating_notebook', 'Connecting to browser...');

      if (!this.browserProvider.isConnected()) {
        await this.browserProvider.connect();
      }

      // Get or create tab for NotebookLM
      const tabResult = await this.initializeNotebookLMTab();
      this.currentTabIndex = tabResult.tabIndex;
      await setSessionTabId(sessionId, tabResult.tabIndex);

      // Navigate to NotebookLM if new tab
      if (tabResult.isNew) {
        await updateSessionPhase(sessionId, 'creating_notebook', 'Opening NotebookLM...');
        await this.browserProvider.navigateTo('https://notebooklm.google.com/', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await this.browserProvider.waitForTimeout(2000);
      }

      // Check login status
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        await updateSessionPhase(
          sessionId,
          'error',
          'Not logged into NotebookLM. Please log in to your Google account in Chrome and try again.'
        );
        throw new Error('Not logged into NotebookLM');
      }

      // Create new notebook
      await updateSessionPhase(sessionId, 'creating_notebook', `Creating notebook: "Research: ${topic}"...`);
      const notebookUrl = await this.createNewNotebook(`Research: ${topic}`);
      await setSessionNotebookUrl(sessionId, notebookUrl);

      // Add initial sources if provided
      if (initialSources && initialSources.length > 0) {
        await updateSessionPhase(sessionId, 'adding_sources', 'Adding initial sources...');

        for (const source of initialSources) {
          try {
            const sourceType = this.getSourceType(source);
            const sourceId = await addSourceToSession(sessionId, {
              type: sourceType,
              content: source,
            });

            await this.addSourceToNotebook(sourceType, source);
            await updateSourceStatus(sessionId, sourceId, 'added');
          } catch (err) {
            this.log('Failed to add source', source, err);
            // Continue with other sources
          }
        }
      }

      // Mark as ready
      const sourceInfo = initialSources ? `Added ${initialSources.length} sources. ` : '';
      await updateSessionPhase(
        sessionId,
        'ready',
        `Research notebook is ready! ${sourceInfo}You can ask questions or add more sources.`
      );

      const session = await getResearchSession(sessionId);
      return session!;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await updateSessionPhase(sessionId, 'error', message);
      throw error;
    }
  }

  /**
   * Add a source to the current research notebook
   */
  async addSource(sessionId: string, source: SourceInput): Promise<void> {
    const session = await getResearchSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.phase !== 'ready') {
      throw new Error(`Research is not ready (current phase: ${session.phase})`);
    }

    // Add source to session tracking
    const sourceId = await addSourceToSession(sessionId, {
      type: source.type,
      content: source.content,
      description: source.description,
    });

    await updateSessionPhase(sessionId, 'adding_sources', `Adding ${source.type}...`);

    try {
      // Switch to the correct tab if needed
      if (session.tabId !== undefined && isTabAwareProvider(this.browserProvider)) {
        await this.browserProvider.switchToTab(session.tabId);
      }

      await this.addSourceToNotebook(source.type, source.content);
      await updateSourceStatus(sessionId, sourceId, 'added');
      await updateSessionPhase(sessionId, 'ready', 'Source added successfully! Processing complete.');
    } catch (error) {
      await updateSourceStatus(sessionId, sourceId, 'failed');
      const message = error instanceof Error ? error.message : 'Unknown error';
      await updateSessionPhase(sessionId, 'error', `Failed to add source: ${message}`);
      throw error;
    }
  }

  /**
   * Ask a question to the notebook
   */
  async askQuestion(sessionId: string, question: string): Promise<string> {
    const session = await getResearchSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.phase !== 'ready') {
      throw new Error(`Research is not ready (current phase: ${session.phase})`);
    }

    // Record the question
    const questionId = await recordQuestion(sessionId, question);
    await updateSessionPhase(sessionId, 'querying', `Asking: ${question}`);

    try {
      // Switch to the correct tab if needed
      if (session.tabId !== undefined && isTabAwareProvider(this.browserProvider)) {
        await this.browserProvider.switchToTab(session.tabId);
      }

      const answer = await this.askNotebook(question);
      await recordAnswer(sessionId, questionId, answer);
      await updateSessionPhase(sessionId, 'ready', answer, answer);

      return answer;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await updateSessionPhase(sessionId, 'error', `Failed to get answer: ${message}`);
      throw error;
    }
  }

  /**
   * Get a summary of the research
   */
  async getSummary(sessionId: string, focusArea?: string): Promise<string> {
    const question = focusArea
      ? `Give me a focused summary on: ${focusArea}`
      : 'Give me a comprehensive overview of all the research material. Summarize the key findings and main points.';

    return this.askQuestion(sessionId, question);
  }

  /**
   * Close the research session
   */
  async closeSession(sessionId: string): Promise<void> {
    await closeResearchSession(sessionId);
  }

  /**
   * Take a screenshot of the current notebook state
   */
  async takeScreenshot(): Promise<string | null> {
    try {
      const buffer = await this.browserProvider.screenshot({ type: 'jpeg', quality: 80 });
      return buffer.toString('base64');
    } catch (error) {
      this.log('Screenshot failed:', error);
      return null;
    }
  }

  /**
   * Get the current URL
   */
  async getCurrentUrl(): Promise<string> {
    return this.browserProvider.getCurrentUrl();
  }

  /**
   * Scroll the page
   */
  async scroll(direction: 'up' | 'down'): Promise<void> {
    const deltaY = direction === 'down' ? 300 : -300;
    await this.browserProvider.scroll(0, deltaY);
  }

  /**
   * Disconnect from the browser
   */
  async disconnect(): Promise<void> {
    await this.browserProvider.disconnect();
  }

  // ============== Private Methods (NotebookLM-specific automation) ==============

  /**
   * Initialize or find a NotebookLM tab
   */
  private async initializeNotebookLMTab(): Promise<{ tabIndex: number; isNew: boolean }> {
    if (isTabAwareProvider(this.browserProvider)) {
      return this.browserProvider.getOrCreateTab('notebooklm.google.com');
    }

    // For providers without tab support, just use the current page
    return { tabIndex: 0, isNew: true };
  }

  /**
   * Check if user is logged into NotebookLM
   */
  private async checkLoginStatus(): Promise<boolean> {
    try {
      const content = await this.browserProvider.getPageContent();

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
      const url = await this.browserProvider.getCurrentUrl();
      return url.includes('notebooklm.google.com');
    } catch (error) {
      this.log('Login check failed:', error);
      return false;
    }
  }

  /**
   * Create a new notebook with a title
   */
  private async createNewNotebook(title: string): Promise<string> {
    await this.browserProvider.waitForTimeout(1000);

    // Find and click "Create notebook" button
    let clicked = false;

    const createButton = await this.browserProvider.querySelector('button:has-text("Create notebook")');
    if (createButton) {
      await createButton.click();
      await this.browserProvider.waitForTimeout(2000);
      clicked = true;
      this.log('Clicked Create notebook button');
    }

    if (!clicked) {
      // Try alternative selectors
      const altButton = await this.browserProvider.querySelector('[aria-label*="new notebook" i], [aria-label*="create notebook" i]');
      if (altButton) {
        await altButton.click();
        await this.browserProvider.waitForTimeout(2000);
      }
    }

    // Wait for notebook to open and close any source dialog
    await this.browserProvider.waitForTimeout(2000);

    // Close the "Add sources" dialog if it appears
    const closeButton = await this.browserProvider.querySelector('button[aria-label="Close dialog"], button:has-text("Close")');
    if (closeButton) {
      await closeButton.click();
      await this.browserProvider.waitForTimeout(500);
    }

    // Try to set the title
    try {
      const titleInput = await this.browserProvider.querySelector('input[type="text"], [contenteditable="true"]');
      if (titleInput) {
        await titleInput.click();
        await this.browserProvider.pressKey('Control+a');
        await titleInput.type(title);
        await this.browserProvider.pressKey('Enter');
        this.log('Set notebook title');
      }
    } catch (e) {
      this.log('Could not set title, continuing...');
    }

    return this.browserProvider.getCurrentUrl();
  }

  /**
   * Add a source to the current notebook
   */
  private async addSourceToNotebook(
    sourceType: 'url' | 'youtube' | 'google_doc' | 'text',
    content: string
  ): Promise<void> {
    // Find and click "Add sources" button
    let addSourceButton = await this.browserProvider.querySelector('button:has-text("Add sources")');
    if (!addSourceButton) {
      addSourceButton = await this.browserProvider.querySelector('[aria-label*="add source" i], button:has-text("Upload")');
    }

    if (addSourceButton) {
      await addSourceButton.click();
      await this.browserProvider.waitForTimeout(1000);
      this.log('Opened add source dialog');
    }

    // Handle URL/Website source type
    if (sourceType === 'url' || sourceType === 'youtube') {
      // Click on Website option
      const websiteOption = await this.browserProvider.querySelector('button:has-text("Website"), [aria-label*="website" i]');
      if (websiteOption) {
        await websiteOption.click();
        await this.browserProvider.waitForTimeout(1000);
      }

      // Find URL input and enter the URL
      const urlInput = await this.browserProvider.querySelector('textarea[placeholder*="URL" i], input[placeholder*="URL" i], textarea');
      if (urlInput) {
        await urlInput.click();
        await urlInput.fill(content);
        this.log('Entered URL');
      }

      // Click Insert button
      await this.browserProvider.waitForTimeout(500);
      const insertButton = await this.browserProvider.querySelector('button:has-text("Insert")');
      if (insertButton) {
        await insertButton.click();
        await this.browserProvider.waitForTimeout(3000);
        this.log('Clicked Insert button');
      }
    } else if (sourceType === 'text') {
      // Click on "Copied text" or "Paste text" option
      const textOption = await this.browserProvider.querySelector('button:has-text("Copied text"), button:has-text("Paste text")');
      if (textOption) {
        await textOption.click();
        await this.browserProvider.waitForTimeout(1000);
      }

      // Find text area and enter content
      const textArea = await this.browserProvider.querySelector('textarea');
      if (textArea) {
        await textArea.fill(content);
      }

      // Click Insert
      const insertButton = await this.browserProvider.querySelector('button:has-text("Insert")');
      if (insertButton) {
        await insertButton.click();
        await this.browserProvider.waitForTimeout(2000);
      }
    }
  }

  /**
   * Ask NotebookLM a question and get the response
   */
  private async askNotebook(question: string): Promise<string> {
    // Find the chat input
    const chatInput = await this.browserProvider.querySelector(
      'textarea[placeholder*="typing" i], input[placeholder*="typing" i], [role="textbox"]'
    );

    if (!chatInput) {
      throw new Error('Could not find chat input');
    }

    // Click to focus and type the question
    await chatInput.click();
    await chatInput.fill(question);

    this.log('Entered question');

    // Press Enter or click submit
    await this.browserProvider.pressKey('Enter');

    // Wait for response - poll until response appears or timeout
    this.log('Waiting for response...');

    let attempts = 0;
    const maxAttempts = 60;
    let lastContent = '';

    while (attempts < maxAttempts) {
      await this.browserProvider.waitForTimeout(1000);

      // Get the latest response text
      const responseElements = await this.browserProvider.querySelectorAll(
        'div[class*="response"], div[class*="answer"], div[class*="message"]'
      );

      if (responseElements.length > 0) {
        const lastResponse = responseElements[responseElements.length - 1];
        const newContent = await lastResponse.textContent() || '';

        // If content stopped changing, response is likely complete
        if (newContent.length > 50 && newContent === lastContent) {
          this.log('Response received');
          return newContent.trim();
        }

        lastContent = newContent;
      }

      // Check if there's a loading indicator
      const loading = await this.browserProvider.querySelector(
        '[class*="loading"], [class*="spinner"], [aria-label*="loading" i]'
      );
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
    const mainContent = await this.browserProvider.getTextContent('main, [role="main"], .chat-container');

    if (mainContent && mainContent.length > 100) {
      // Extract last substantial paragraph
      const paragraphs = mainContent.split('\n').filter(p => p.trim().length > 50);
      if (paragraphs.length > 0) {
        return paragraphs[paragraphs.length - 1].trim();
      }
    }

    return 'Response received but could not extract text. Please check the NotebookLM window.';
  }

  /**
   * Determine source type from content
   */
  private getSourceType(source: string): 'url' | 'youtube' | 'google_doc' | 'text' {
    if (source.includes('youtube.com') || source.includes('youtu.be')) {
      return 'youtube';
    }
    if (source.includes('docs.google.com')) {
      return 'google_doc';
    }
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return 'url';
    }
    return 'text';
  }
}

// Re-export types
export type { SourceInput as NotebookSourceInput };
