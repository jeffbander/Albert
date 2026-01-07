/**
 * NotebookLM API Route
 * Handles research operations for the Albert voice assistant.
 * Uses browser automation to control NotebookLM in the user's Chrome.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createResearchSession,
  getActiveResearchSession,
  getResearchSession,
  updateSessionPhase,
  setSessionTabId,
  setSessionNotebookUrl,
  addSourceToSession,
  updateSourceStatus,
  recordQuestion,
  recordAnswer,
  closeResearchSession,
} from '@/lib/researchSessionStore';
import * as controller from '@/lib/notebookLMController';

// Track running operations to prevent concurrent modifications
const runningOperations = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    console.log(`[NotebookLM API] Action: ${action}`, params);

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
        const existing = getActiveResearchSession();
        if (existing && existing.phase !== 'complete' && existing.phase !== 'error') {
          return NextResponse.json({
            success: false,
            error: `A research session is already active: "${existing.topic}". Close it first with close_research.`,
            activeSessionId: existing.id,
          }, { status: 409 });
        }

        // Create new session
        const sessionId = createResearchSession(topic);
        updateSessionPhase(sessionId, 'initializing', `Starting research on "${topic}"...`);

        // Start the research process asynchronously
        startResearchAsync(sessionId, topic, initialSources).catch(err => {
          console.error(`[NotebookLM API] Research failed:`, err);
          updateSessionPhase(sessionId, 'error', err.message);
        });

        return NextResponse.json({
          success: true,
          sessionId,
          message: `Starting research on "${topic}". I'll keep you updated on progress.`,
          streamUrl: `/api/notebooklm/${sessionId}/stream`,
        });
      }

      case 'add_source': {
        const session = getActiveResearchSession();
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
        const sourceId = addSourceToSession(session.id, {
          type: sourceType,
          content,
          description,
        });

        // Add source asynchronously
        addSourceAsync(session.id, session.tabId!, sourceType, content, sourceId).catch(err => {
          console.error(`[NotebookLM API] Add source failed:`, err);
          updateSourceStatus(session.id, sourceId, 'failed');
          updateSessionPhase(session.id, 'error', `Failed to add source: ${err.message}`);
        });

        return NextResponse.json({
          success: true,
          sourceId,
          message: `Adding ${sourceType} source to the research...`,
        });
      }

      case 'ask_notebook': {
        const session = getActiveResearchSession();
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
        const questionId = recordQuestion(session.id, question);
        updateSessionPhase(session.id, 'querying', `Asking: ${question}`);

        // Ask asynchronously
        askNotebookAsync(session.id, session.tabId!, question, questionId).catch(err => {
          console.error(`[NotebookLM API] Ask failed:`, err);
          updateSessionPhase(session.id, 'error', `Failed to get answer: ${err.message}`);
        });

        return NextResponse.json({
          success: true,
          questionId,
          message: "Asking NotebookLM... I'll tell you when I have an answer.",
        });
      }

      case 'get_summary': {
        const session = getActiveResearchSession();
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

        const questionId = recordQuestion(session.id, overviewQuestion);
        updateSessionPhase(session.id, 'querying', 'Generating summary...');

        askNotebookAsync(session.id, session.tabId!, overviewQuestion, questionId).catch(err => {
          console.error(`[NotebookLM API] Summary failed:`, err);
          updateSessionPhase(session.id, 'error', `Failed to get summary: ${err.message}`);
        });

        return NextResponse.json({
          success: true,
          message: 'Generating research summary...',
        });
      }

      case 'close_research': {
        const session = getActiveResearchSession();
        if (session) {
          closeResearchSession(session.id);
        }

        return NextResponse.json({
          success: true,
          message: 'Research session closed. Your notebook is saved in NotebookLM.',
        });
      }

      case 'get_status': {
        const session = params.sessionId
          ? getResearchSession(params.sessionId)
          : getActiveResearchSession();

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
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
    }, { status: 500 });
  }
}

export async function GET() {
  const session = getActiveResearchSession();

  return NextResponse.json({
    status: 'ok',
    service: 'notebooklm',
    hasActiveSession: !!session,
    session: session ? {
      id: session.id,
      topic: session.topic,
      phase: session.phase,
    } : null,
  });
}

/**
 * Start research asynchronously
 */
async function startResearchAsync(
  sessionId: string,
  topic: string,
  initialSources?: string
): Promise<void> {
  const operationKey = `start:${sessionId}`;

  if (runningOperations.has(operationKey)) {
    throw new Error('Research is already starting');
  }

  runningOperations.add(operationKey);

  try {
    // Initialize browser
    updateSessionPhase(sessionId, 'creating_notebook', 'Connecting to Chrome...');

    let tabId: number;
    let isNew: boolean;

    try {
      const result = await controller.initializeBrowser();
      tabId = result.tabId;
      isNew = result.isNew;
    } catch (browserError) {
      const errorMsg = browserError instanceof Error ? browserError.message : 'Browser connection failed';

      // Provide helpful instructions for CDP connection issues
      if (errorMsg.includes('Failed to connect') || errorMsg.includes('ECONNREFUSED')) {
        updateSessionPhase(
          sessionId,
          'error',
          'Cannot connect to Chrome. Please restart Chrome with debugging enabled: Close Chrome completely, then run: chrome.exe --remote-debugging-port=9222'
        );
        return;
      }

      throw browserError;
    }

    setSessionTabId(sessionId, tabId);
    updateSessionPhase(sessionId, 'creating_notebook', 'Opening NotebookLM...');

    // Navigate to NotebookLM if needed
    if (isNew) {
      await controller.navigateToNotebookLM(tabId);
    }

    // Check if logged in
    const isLoggedIn = await controller.checkLoginStatus(tabId);
    if (!isLoggedIn) {
      updateSessionPhase(
        sessionId,
        'error',
        'Not logged into NotebookLM. Please log in to your Google account in Chrome and try again.'
      );
      return;
    }

    // Create new notebook
    updateSessionPhase(sessionId, 'creating_notebook', `Creating notebook: "Research: ${topic}"...`);
    const notebookUrl = await controller.createNewNotebook(tabId, `Research: ${topic}`);
    setSessionNotebookUrl(sessionId, notebookUrl);

    // Add initial sources if provided
    if (initialSources) {
      updateSessionPhase(sessionId, 'adding_sources', 'Adding initial sources...');

      const sources = initialSources.split(',').map(s => s.trim()).filter(s => s.length > 0);

      for (const source of sources) {
        try {
          const sourceType = getSourceType(source);
          const sourceId = addSourceToSession(sessionId, {
            type: sourceType,
            content: source,
          });

          await controller.addSourceToNotebook(tabId, sourceType, source);
          updateSourceStatus(sessionId, sourceId, 'added');

        } catch (err) {
          console.error(`[NotebookLM] Failed to add source ${source}:`, err);
          // Continue with other sources
        }
      }
    }

    // Mark as ready
    updateSessionPhase(
      sessionId,
      'ready',
      `Research notebook is ready! ${initialSources ? `Added ${initialSources.split(',').length} sources. ` : ''}You can ask questions or add more sources.`
    );

  } finally {
    runningOperations.delete(operationKey);
  }
}

/**
 * Add source asynchronously
 */
async function addSourceAsync(
  sessionId: string,
  tabId: number,
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
    updateSessionPhase(sessionId, 'adding_sources', `Adding ${sourceType}...`);

    await controller.addSourceToNotebook(
      tabId,
      sourceType as 'url' | 'youtube' | 'google_doc' | 'text',
      content
    );

    updateSourceStatus(sessionId, sourceId, 'added');
    updateSessionPhase(sessionId, 'ready', 'Source added successfully! Processing complete.');

  } finally {
    runningOperations.delete(operationKey);
  }
}

/**
 * Ask notebook question asynchronously
 */
async function askNotebookAsync(
  sessionId: string,
  tabId: number,
  question: string,
  questionId: string
): Promise<void> {
  const operationKey = `ask:${sessionId}:${questionId}`;

  if (runningOperations.has(operationKey)) {
    throw new Error('Question is already being asked');
  }

  runningOperations.add(operationKey);

  try {
    const answer = await controller.askNotebookQuestion(tabId, question);

    recordAnswer(sessionId, questionId, answer);

    // Emit the answer via progress event
    updateSessionPhase(sessionId, 'ready', answer, answer);

  } finally {
    runningOperations.delete(operationKey);
  }
}

/**
 * Determine source type from content
 */
function getSourceType(source: string): 'url' | 'youtube' | 'google_doc' | 'text' {
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
