/**
 * Perplexity AI Client
 * Provides real-time web search with AI-powered answers.
 * Uses the Sonar model family for grounded, cited responses.
 *
 * @see https://docs.perplexity.ai/
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PerplexityCitation {
  url: string;
  title?: string;
  snippet?: string;
}

export interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  citations?: string[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ResearchOptions {
  model?: 'sonar' | 'sonar-pro' | 'sonar-reasoning' | 'sonar-reasoning-pro' | 'sonar-deep-research';
  searchMode?: 'high' | 'medium' | 'low';
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  returnCitations?: boolean;
  searchRecency?: 'day' | 'week' | 'month' | 'year';
  /** Timeout in milliseconds (default: 45000 for research, 30000 for news) */
  timeout?: number;
}

export interface ResearchResult {
  answer: string;
  citations: string[];
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Perplexity AI Client for research and web search
 */
export class PerplexityClient {
  private apiKey: string;
  private debug: boolean;

  constructor(options?: { apiKey?: string; debug?: boolean }) {
    this.apiKey = options?.apiKey || process.env.PERPLEXITY_API_KEY || '';
    this.debug = options?.debug ?? false;

    if (!this.apiKey) {
      console.warn('[Perplexity] No API key provided. Set PERPLEXITY_API_KEY environment variable.');
    }
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[Perplexity] ${message}`, ...args);
    }
  }

  /**
   * Check if the client is configured with an API key
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Perform a research query with web search
   */
  async research(query: string, options: ResearchOptions = {}): Promise<ResearchResult> {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured. Set PERPLEXITY_API_KEY environment variable.');
    }

    const {
      model = 'sonar',
      maxTokens = 4096,
      temperature = 0.2,
      systemPrompt,
      returnCitations = true,
      searchRecency,
      timeout = 45000, // Default 45 seconds for research
    } = options;

    this.log(`Research query: "${query}" with model: ${model}, timeout: ${timeout}ms`);

    const messages: PerplexityMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    } else {
      messages.push({
        role: 'system',
        content: 'You are a helpful research assistant. Provide accurate, well-cited answers based on current web information. Be concise but thorough.',
      });
    }

    // Add user query
    messages.push({
      role: 'user',
      content: query,
    });

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      return_citations: returnCitations,
    };

    // Add search recency filter if specified
    if (searchRecency) {
      requestBody.search_recency_filter = searchRecency;
    }

    // Set up timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        this.log('API error:', response.status, errorText);
        throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
      }

      const data: PerplexityResponse = await response.json();

      this.log('Response received:', data.choices?.[0]?.message?.content?.slice(0, 100) + '...');

      const answer = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];

      return {
        answer,
        citations,
        model: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        this.log('Research timed out after', timeout, 'ms');
        throw new Error(`Research request timed out after ${Math.round(timeout / 1000)} seconds. The query may be too complex or the service is slow.`);
      }

      this.log('Research failed:', error);
      throw error;
    }
  }

  /**
   * Ask a follow-up question in a research conversation
   */
  async followUp(
    conversationHistory: PerplexityMessage[],
    followUpQuestion: string,
    options: ResearchOptions = {}
  ): Promise<ResearchResult> {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured.');
    }

    const {
      model = 'sonar-pro', // Pro is better for follow-ups
      maxTokens = 4096,
      temperature = 0.2,
      returnCitations = true,
      timeout = 45000, // Default 45 seconds for follow-ups
    } = options;

    this.log(`Follow-up question: "${followUpQuestion}"`);

    // Add the follow-up question to conversation
    const messages: PerplexityMessage[] = [
      ...conversationHistory,
      { role: 'user', content: followUpQuestion },
    ];

    // Set up timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          return_citations: returnCitations,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
      }

      const data: PerplexityResponse = await response.json();

      return {
        answer: data.choices?.[0]?.message?.content || '',
        citations: data.citations || [],
        model: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Follow-up request timed out after ${Math.round(timeout / 1000)} seconds.`);
      }

      throw error;
    }
  }

  /**
   * Get a quick summary of a topic
   */
  async summarize(topic: string, options: ResearchOptions = {}): Promise<ResearchResult> {
    const systemPrompt = `You are a research assistant. Provide a comprehensive but concise summary of the topic.
Include key facts, recent developments, and important context. Cite your sources.`;

    return this.research(topic, {
      ...options,
      systemPrompt,
      model: options.model || 'sonar-pro',
    });
  }

  /**
   * Get the latest news on a topic
   */
  async getNews(topic: string, options: ResearchOptions = {}): Promise<ResearchResult> {
    const systemPrompt = `You are a news research assistant. Find and summarize the latest news about the topic.
Focus on recent developments, breaking news, and important updates. Always cite your sources.`;

    return this.research(`Latest news about: ${topic}`, {
      ...options,
      systemPrompt,
      searchRecency: options.searchRecency || 'week',
      model: options.model || 'sonar',
      timeout: options.timeout || 30000, // News queries use shorter 30s timeout
    });
  }

  /**
   * Research with deep reasoning (for complex topics)
   */
  async deepResearch(query: string, options: ResearchOptions = {}): Promise<ResearchResult> {
    return this.research(query, {
      ...options,
      model: 'sonar-reasoning-pro',
      maxTokens: options.maxTokens || 8192,
    });
  }
}

// Singleton instance
let perplexityClient: PerplexityClient | null = null;

/**
 * Get the shared Perplexity client instance
 */
export function getPerplexityClient(): PerplexityClient {
  if (!perplexityClient) {
    perplexityClient = new PerplexityClient({
      debug: process.env.NODE_ENV === 'development',
    });
  }
  return perplexityClient;
}

/**
 * Quick research function using the shared client
 */
export async function quickResearch(query: string, options?: ResearchOptions): Promise<ResearchResult> {
  const client = getPerplexityClient();
  return client.research(query, options);
}

/**
 * Quick news lookup using the shared client
 */
export async function getLatestNews(topic: string): Promise<ResearchResult> {
  const client = getPerplexityClient();
  return client.getNews(topic);
}

export default PerplexityClient;
