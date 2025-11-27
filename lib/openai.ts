import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
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
