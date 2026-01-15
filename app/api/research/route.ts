/**
 * Research API Route
 * Provides AI-powered research using Perplexity Sonar.
 * Replaces NotebookLM browser automation with direct API calls.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPerplexityClient, type ResearchOptions, type PerplexityMessage } from '@/lib/perplexity';
import { EventEmitter } from 'events';

// Research session storage (in-memory for simplicity)
interface ResearchSession {
  id: string;
  topic: string;
  userId: string;
  conversationHistory: PerplexityMessage[];
  citations: string[];
  status: 'active' | 'completed' | 'error';
  createdAt: Date;
  updatedAt: Date;
  lastAnswer?: string;
}

const researchSessions = new Map<string, ResearchSession>();
const sessionEmitter = new EventEmitter();

// Get active session for user
function getActiveSession(userId: string): ResearchSession | null {
  for (const session of researchSessions.values()) {
    if (session.userId === userId && session.status === 'active') {
      return session;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;
    const userId = params.userId || 'default-voice-user';

    console.log(`[Research API] Action: ${action}`, params);

    const client = getPerplexityClient();

    if (!client.isConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Perplexity API not configured. Set PERPLEXITY_API_KEY environment variable.',
      }, { status: 500 });
    }

    switch (action) {
      case 'start_research': {
        const { topic, searchRecency } = params;

        if (!topic) {
          return NextResponse.json({
            success: false,
            error: 'Topic is required',
          }, { status: 400 });
        }

        // Check for existing active session
        const existing = getActiveSession(userId);
        if (existing) {
          return NextResponse.json({
            success: false,
            error: `Research session already active: "${existing.topic}". Close it first.`,
            activeSessionId: existing.id,
          }, { status: 409 });
        }

        // Create new session
        const sessionId = `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const session: ResearchSession = {
          id: sessionId,
          topic,
          userId,
          conversationHistory: [
            {
              role: 'system',
              content: `You are a research assistant helping the user research: "${topic}". Provide accurate, well-cited answers. Be conversational but thorough.`,
            },
          ],
          citations: [],
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        researchSessions.set(sessionId, session);

        // Perform initial research
        try {
          const options: ResearchOptions = {
            model: 'sonar-pro',
            searchRecency: searchRecency || undefined,
          };

          const result = await client.research(
            `Research and provide a comprehensive overview of: ${topic}`,
            options
          );

          // Update session with results
          session.conversationHistory.push(
            { role: 'user', content: `Research: ${topic}` },
            { role: 'assistant', content: result.answer }
          );
          session.citations = result.citations;
          session.lastAnswer = result.answer;
          session.updatedAt = new Date();

          // Emit progress event
          sessionEmitter.emit(`research:${sessionId}`, {
            type: 'research_complete',
            sessionId,
            topic,
            answer: result.answer,
            citations: result.citations,
          });

          return NextResponse.json({
            success: true,
            sessionId,
            topic,
            answer: result.answer,
            citations: result.citations,
            message: `Research on "${topic}" complete. You can ask follow-up questions.`,
          });
        } catch (error) {
          session.status = 'error';
          const errorMsg = error instanceof Error ? error.message : 'Research failed';
          return NextResponse.json({
            success: false,
            sessionId,
            error: errorMsg,
          }, { status: 500 });
        }
      }

      case 'ask_question': {
        const { question, sessionId } = params;

        if (!question) {
          return NextResponse.json({
            success: false,
            error: 'Question is required',
          }, { status: 400 });
        }

        // Find session
        let session = sessionId ? researchSessions.get(sessionId) : getActiveSession(userId);

        if (!session) {
          // No session - do standalone research
          const result = await client.research(question, { model: 'sonar-pro' });
          return NextResponse.json({
            success: true,
            answer: result.answer,
            citations: result.citations,
          });
        }

        // Ask follow-up question
        try {
          const result = await client.followUp(
            session.conversationHistory,
            question,
            { model: 'sonar-pro' }
          );

          // Update session
          session.conversationHistory.push(
            { role: 'user', content: question },
            { role: 'assistant', content: result.answer }
          );
          session.citations = [...new Set([...session.citations, ...result.citations])];
          session.lastAnswer = result.answer;
          session.updatedAt = new Date();

          return NextResponse.json({
            success: true,
            sessionId: session.id,
            answer: result.answer,
            citations: result.citations,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Question failed';
          return NextResponse.json({
            success: false,
            error: errorMsg,
          }, { status: 500 });
        }
      }

      case 'get_summary': {
        const { sessionId, focusArea } = params;

        const session = sessionId ? researchSessions.get(sessionId) : getActiveSession(userId);

        if (!session) {
          return NextResponse.json({
            success: false,
            error: 'No active research session',
          }, { status: 400 });
        }

        const question = focusArea
          ? `Summarize the key findings about: ${focusArea}`
          : `Summarize the key findings from our research on "${session.topic}"`;

        const result = await client.followUp(
          session.conversationHistory,
          question,
          { model: 'sonar-pro' }
        );

        session.conversationHistory.push(
          { role: 'user', content: question },
          { role: 'assistant', content: result.answer }
        );
        session.lastAnswer = result.answer;
        session.updatedAt = new Date();

        return NextResponse.json({
          success: true,
          sessionId: session.id,
          summary: result.answer,
          citations: result.citations,
          totalCitations: session.citations.length,
        });
      }

      case 'get_news': {
        const { topic } = params;

        if (!topic) {
          return NextResponse.json({
            success: false,
            error: 'Topic is required',
          }, { status: 400 });
        }

        const result = await client.getNews(topic);

        return NextResponse.json({
          success: true,
          topic,
          news: result.answer,
          citations: result.citations,
        });
      }

      case 'close_research': {
        const { sessionId: closeSessionId } = params;

        const session = closeSessionId
          ? researchSessions.get(closeSessionId)
          : getActiveSession(userId);

        if (!session) {
          return NextResponse.json({
            success: true,
            message: 'No active session to close',
          });
        }

        session.status = 'completed';
        session.updatedAt = new Date();

        // Clean up old sessions (keep last 10)
        const sessions = Array.from(researchSessions.entries())
          .sort(([, a], [, b]) => b.updatedAt.getTime() - a.updatedAt.getTime());

        if (sessions.length > 10) {
          sessions.slice(10).forEach(([id]) => researchSessions.delete(id));
        }

        return NextResponse.json({
          success: true,
          message: `Research session "${session.topic}" closed.`,
          summary: {
            topic: session.topic,
            questionsAsked: session.conversationHistory.filter(m => m.role === 'user').length,
            citationsFound: session.citations.length,
          },
        });
      }

      case 'get_status': {
        const session = getActiveSession(userId);

        return NextResponse.json({
          success: true,
          hasActiveSession: Boolean(session),
          session: session ? {
            id: session.id,
            topic: session.topic,
            status: session.status,
            questionsAsked: session.conversationHistory.filter(m => m.role === 'user').length,
            citationsCount: session.citations.length,
            lastAnswer: session.lastAnswer?.slice(0, 200) + '...',
          } : null,
        });
      }

      case 'health_check': {
        // Simple health check - just verify the client is configured
        return NextResponse.json({
          success: true,
          configured: true,
          message: 'Perplexity API is configured and ready',
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Research API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'default-voice-user';

  const session = getActiveSession(userId);

  return NextResponse.json({
    success: true,
    hasActiveSession: Boolean(session),
    session: session ? {
      id: session.id,
      topic: session.topic,
      status: session.status,
      citationsCount: session.citations.length,
    } : null,
  });
}
