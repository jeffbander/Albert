import MemoryClient from 'mem0ai';

let mem0Client: MemoryClient | null = null;

function getMem0Client(): MemoryClient {
  if (!mem0Client) {
    mem0Client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });
  }
  return mem0Client;
}

const USER_ID = 'echo_user';
const ECHO_SELF_ID = 'echo_self';

export interface Memory {
  id: string;
  memory: string;
  created_at?: string;
  updated_at?: string;
}

export async function searchMemories(query: string): Promise<Memory[]> {
  try {
    const mem0 = getMem0Client();
    const results = await mem0.search(query, { user_id: USER_ID });
    return results as Memory[];
  } catch (error) {
    console.error('Error searching memories:', error);
    return [];
  }
}

export async function addMemory(content: string, metadata?: Record<string, unknown>) {
  try {
    const mem0 = getMem0Client();
    const result = await mem0.add(
      [{ role: 'user', content }],
      { user_id: USER_ID, metadata }
    );
    return result;
  } catch (error) {
    console.error('Error adding memory:', error);
    return null;
  }
}

export async function searchEchoMemories(query: string): Promise<Memory[]> {
  try {
    const mem0 = getMem0Client();
    const results = await mem0.search(query, { user_id: ECHO_SELF_ID });
    return results as Memory[];
  } catch (error) {
    console.error('Error searching Echo memories:', error);
    return [];
  }
}

export async function addEchoMemory(content: string, metadata?: Record<string, unknown>) {
  try {
    const mem0 = getMem0Client();
    const result = await mem0.add(
      [{ role: 'assistant', content }],
      { user_id: ECHO_SELF_ID, metadata }
    );
    return result;
  } catch (error) {
    console.error('Error adding Echo memory:', error);
    return null;
  }
}

export async function getRecentMemories(limit: number = 5): Promise<Memory[]> {
  try {
    const mem0 = getMem0Client();
    const results = await mem0.getAll({ user_id: USER_ID });
    const memories = results as Memory[];
    return memories.slice(0, limit);
  } catch (error) {
    console.error('Error getting recent memories:', error);
    return [];
  }
}

export default getMem0Client;
