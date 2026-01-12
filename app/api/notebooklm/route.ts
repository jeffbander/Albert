/**
 * NotebookLM API Route
 * Handles research operations for the Albert voice assistant.
 * Uses browser automation to control NotebookLM with provider abstraction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBrowserProvider, createBrowserProviderWithFallback, BrowserProviderError } from '@/lib/browser';
import type { BrowserProviderConfig } from '@/lib/browser/types';
import { NotebookLMService } from '@/lib/notebooklm';
import { getOptionalUser, UnauthorizedError } from '@/lib/auth/get-user';
import {
  getActiveResearchSession,
  getResearchSession,
  updateSessionPhase,
  addSourceToSession,
  updateSourceStatus,
  recordQuestion,
  closeResearchSession,
} from '@/lib/researchSessionStore';

// Track running operations to prevent concurrent modifications
const runningOperations = new Set<string>();

// Cache service instances by user (for session reuse)
const serviceCache = new Map<string, NotebookLMService>();

/**
 * Get or create a NotebookLMService instance for a user
 */
async function getServiceForUser(userId: string): Promise<NotebookLMService> {
  // Check cache first
  const cached = serviceCache.get(userId);
  if (cached) {
    return cached;
  }

  // Create browser provider based on environment
  const providerConfig: BrowserProviderConfig = {
    type: (process.env.BROWSER_PROVIDER || 'local-cdp') as BrowserProviderConfig['type'],
    debugPort: parseInt(process.env.CHROME_DEBUG_PORT || '9222', 10),
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    debug: process.env.BROWSER_DEBUG === 'true',
  };

  let browserProvider;
  try {
    // Try to create with fallback support
    browserProvider = await createBrowserProviderWithFallback(
      providerConfig.type === 'browserbase' // preferCloud
    );
  } catch {
    // If fallback fails, try direct creation for better error messages
    browserProvider = createBrowserProvider(providerConfig);
  }

  const service = new NotebookLMService(browserProvider, {
    debug: process.env.NODE_ENV === 'development',
  });

  // Cache the service
  serviceCache.set(userId, service);

  return service;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    console.log(`[NotebookLM API] Action: ${action}`, params);

    // Get optional user for user-scoped operations
    // Note: For voice assistant, auth may be optional depending on deployment
    const user = await getOptionalUser();
    const userId = user?.id || 'anonymous';

    switch (action) {
      case 'start_research': {
        const { topic, initialSources } = params;

        if (!topic) {
          return NextResponse.json({
            success: false,
            error: 'Topic is required',
          }, { status: 400 });
        }

        // Check if there's already an active session
        const existing = await getActiveResearchSession();
        if (existing && existing.phase !== 'complete' && existing.phase !== 'error') {
          return NextResponse.json({
            success: false,
            error: `A research session is already active: "${existing.topic}". Close it first with close_research.`,
            activeSessionId: existing.id,
          }, { status: 409 });
        }

        // Get or create service
        const service = await getServiceForUser(userId);

        // Start the research process asynchronously
        const sourcesArray = initialSources
          ? initialSources.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
          : undefined;

        // Start async operation
        startResearchAsync(service, userId, topic, sourcesArray).catch(err => {
          console.error(`[NotebookLM API] Research failed:`, err);
        });

        // Get the session that was just created
        const session = await getActiveResearchSession();

        return NextResponse.json({
          success: true,
          sessionId: session?.id,
          message: `Starting research on "${topic}". I'll keep you updated on progress.`,
          streamUrl: session ? `/api/notebooklm/${session.id}/stream` : null,
        });
      }

      case 'add_source': {
        const session = await getActiveResearchSession();
        if (!session) {
          return NextResponse.json({
            success: false,
            error: 'No active research session. Start a research session first.',
          }, { status: 400 });
        }

        if (session.phase !== 'ready') {
          return NextResponse.json({
            success: false,
            error: `Research is not ready (current phase: ${session.phase}). Wait for the notebook to be ready.`,
          }, { status: 400 });
        }

        const { sourceType, content, description } = params;

        if (!sourceType || !content) {
          return NextResponse.json({
            success: false,
            error: 'sourceType and content are required',
          }, { status: 400 });
        }

        // Add source to session
        const sourceId = await addSourceToSession(session.id, {
          type: sourceType,
          content,
          description,
        });

        // Get service and add source asynchronously
        const service = await getServiceForUser(userId);
        addSourceAsync(service, session.id, sourceType, content, sourceId).catch(async err => {
          console.error(`[NotebookLM API] Add source failed:`, err);
          await updateSourceStatus(session.id, sourceId, 'failed');
          await updateSessionPhase(session.id, 'error', `Failed to add source: ${err.message}`);
        });

        return NextResponse.json({
          success: true,
          sourceId,
          message: `Adding ${sourceType} source to the research...`,
        });
      }

      case 'ask_notebook': {
        const session = await getActiveResearchSession();
        if (!session) {
          return NextResponse.json({
            success: false,
            error: 'No active research session. Start a research session first.',
          }, { status: 400 });
        }

        if (session.phase !== 'ready') {
          return NextResponse.json({
            success: false,
            error: `Research is not ready (current phase: ${session.phase}). Wait for the notebook to be ready.`,
          }, { status: 400 });
        }

        const { question } = params;

        if (!question) {
          return NextResponse.json({
            success: false,
            error: 'Question is required',
          }, { status: 400 });
        }

        // Record the question
        const questionId = await recordQuestion(session.id, question);
        await updateSessionPhase(session.id, 'querying', `Asking: ${question}`);

        // Get service and ask asynchronously
        const service = await getServiceForUser(userId);
        askNotebookAsync(service, session.id, question, questionId).catch(async err => {
          console.error(`[NotebookLM API] Ask failed:`, err);
          await updateSessionPhase(session.id, 'error', `Failed to get answer: ${err.message}`);
        });

        return NextResponse.json({
          success: true,
          questionId,
          message: "Asking NotebookLM... I'll tell you when I have an answer.",
        });
      }

      case 'get_summary': {
        const session = await getActiveResearchSession();
        if (!session) {
          return NextResponse.json({
            success: false,
            error: 'No active research session.',
          }, { status: 400 });
        }

        if (session.phase !== 'ready') {
          return NextResponse.json({
            success: false,
            error: `Research is not ready (current phase: ${session.phase}).`,
          }, { status: 400 });
        }

        // Ask for an overview
        const overviewQuestion = params.focusArea
          ? `Give me a focused summary on: ${params.focusArea}`
          : 'Give me a comprehensive overview of all the research material. Summarize the key findings and main points.';

        const questionId = await recordQuestion(session.id, overviewQuestion);
        await updateSessionPhase(session.id, 'querying', 'Generating summary...');

        const service = await getServiceForUser(userId);
        askNotebookAsync(service, session.id, overviewQuestion, questionId).catch(async err => {
          console.error(`[NotebookLM API] Summary failed:`, err);
          await updateSessionPhase(session.id, 'error', `Failed to get summary: ${err.message}`);
        });

        return NextResponse.json({
          success: true,
          message: 'Generating research summary...',
        });
      }

      case 'close_research': {
        const session = await getActiveResearchSession();
        if (session) {
          await closeResearchSession(session.id);

          // Clean up service cache
          serviceCache.delete(userId);
        }

        return NextResponse.json({
          success: true,
          message: 'Research session closed. Your notebook is saved in NotebookLM.',
        });
      }

      case 'get_status': {
        const session = params.sessionId
          ? await getResearchSession(params.sessionId)
          : await getActiveResearchSession();

        if (!session) {
          return NextResponse.json({
            success: true,
            hasActiveSession: false,
            message: 'No active research session.',
          });
        }

        return NextResponse.json({
          success: true,
          hasActiveSession: true,
          session: {
            id: session.id,
            topic: session.topic,
            phase: session.phase,
            sourcesCount: session.sources.length,
            questionsCount: session.questions.length,
            notebookUrl: session.notebookUrl,
            error: session.error,
          },
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }

  } catch (error) {
    console.error('[NotebookLM API] Error:', error);

    // Handle specific error types
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required for this operation',
      }, { status: 401 });
    }

    if (error instanceof BrowserProviderError) {
      // Provide helpful error messages for browser issues
      let userMessage = error.message;

      if (error.code === 'CONNECTION_FAILED') {
        userMessage = 'Cannot connect to browser. Please start Chrome with debugging enabled: chrome.exe --remote-debugging-port=9222';
      } else if (error.code === 'AUTHENTICATION_REQUIRED') {
        userMessage = 'Browser provider authentication failed. Please check your API key configuration.';
      } else if (error.code === 'PROVIDER_NOT_AVAILABLE') {
        userMessage = 'Browser automation is not available. Please configure a browser provider.';
      }

      return NextResponse.json({
        success: false,
        error: userMessage,
        errorCode: error.code,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
    }, { status: 500 });
  }
}

export async function GET() {
  const session = await getActiveResearchSession();

  return NextResponse.json({
    status: 'ok',
    service: 'notebooklm',
    hasActiveSession: !!session,
    session: session ? {
      id: session.id,
      topic: session.topic,
      phase: session.phase,
    } : null,
    browserProvider: process.env.BROWSER_PROVIDER || 'local-cdp',
  });
}

/**
 * Start research asynchronously
 */
async function startResearchAsync(
  service: NotebookLMService,
  userId: string,
  topic: string,
  initialSources?: string[]
): Promise<void> {
  const operationKey = `start:${userId}:${topic}`;

  if (runningOperations.has(operationKey)) {
    throw new Error('Research is already starting');
  }

  runningOperations.add(operationKey);

  try {
    await service.startResearch(userId, topic, initialSources);
  } catch (error) {
    const session = await getActiveResearchSession();
    if (session) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Provide helpful instructions for CDP connection issues
      if (error instanceof BrowserProviderError && error.code === 'CONNECTION_FAILED') {
        await updateSessionPhase(
          session.id,
          'error',
          'Cannot connect to Chrome. Please restart Chrome with debugging enabled: Close Chrome completely, then run: chrome.exe --remote-debugging-port=9222'
        );
      } else {
        await updateSessionPhase(session.id, 'error', message);
      }
    }
    throw error;
  } finally {
    runningOperations.delete(operationKey);
  }
}

/**
 * Add source asynchronously
 */
async function addSourceAsync(
  service: NotebookLMService,
  sessionId: string,
  sourceType: string,
  content: string,
  sourceId: string
): Promise<void> {
  const operationKey = `source:${sessionId}:${sourceId}`;

  if (runningOperations.has(operationKey)) {
    throw new Error('Source is already being added');
  }

  runningOperations.add(operationKey);

  try {
    await service.addSource(sessionId, {
      type: sourceType as 'url' | 'youtube' | 'google_doc' | 'text',
      content,
    });
  } finally {
    runningOperations.delete(operationKey);
  }
}

/**
 * Ask notebook question asynchronously
 */
async function askNotebookAsync(
  service: NotebookLMService,
  sessionId: string,
  question: string,
  questionId: string
): Promise<void> {
  const operationKey = `ask:${sessionId}:${questionId}`;

  if (runningOperations.has(operationKey)) {
    throw new Error('Question is already being asked');
  }

  runningOperations.add(operationKey);

  try {
    // The service handles recording the answer internally
    await service.askQuestion(sessionId, question);
  } finally {
    runningOperations.delete(operationKey);
  }
}
