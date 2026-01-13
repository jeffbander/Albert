import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    // Trim to remove any trailing newlines/whitespace from Vercel CLI
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function createEphemeralToken(): Promise<{ client_secret: { value: string } }> {
  const openai = getOpenAIClient();
  const response = await openai.beta.realtime.sessions.create({
    model: 'gpt-4o-realtime-preview-2024-12-17',
    voice: 'echo',
  });

  return {
    client_secret: {
      value: response.client_secret?.value || '',
    },
  };
}

export default getOpenAIClient;
