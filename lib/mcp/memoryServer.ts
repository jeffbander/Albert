#!/usr/bin/env node
/**
 * Albert Memory MCP Server
 *
 * This server exposes Albert's memory system to other tools via the
 * Model Context Protocol. It allows any MCP-compatible client to:
 * - Search Albert's memory
 * - Add new memories with categories
 * - Get recent memories
 * - Get context for topics
 * - Manage temporal facts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import MemoryClient from 'mem0ai';

const USER_ID = 'echo_user';
const ECHO_SELF_ID = 'echo_self';

let mem0Client: MemoryClient | null = null;

function getMem0Client(): MemoryClient {
  if (!mem0Client) {
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
      throw new Error('MEM0_API_KEY not set');
    }
    mem0Client = new MemoryClient({ apiKey });
  }
  return mem0Client;
}

const VALID_CATEGORIES = [
  'user_preferences',
  'implementation',
  'troubleshooting',
  'component_context',
  'project_overview',
  'task_history',
  'entity_fact',
  'conversation_insight',
  'workflow_pattern',
];

const server = new Server(
  {
    name: 'albert-memory',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_memory',
        description: "Search Albert's memory for relevant information using semantic search",
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default: 5)',
            },
            category: {
              type: 'string',
              description: 'Optional category filter',
              enum: VALID_CATEGORIES,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_memory',
        description: "Add a new memory to Albert's knowledge base with optional categorization",
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The memory content to store',
            },
            category: {
              type: 'string',
              description: 'Category for the memory',
              enum: VALID_CATEGORIES,
            },
            entity: {
              type: 'string',
              description: 'The entity this fact is about (optional)',
            },
            factKey: {
              type: 'string',
              description: 'Unique key for this type of fact, e.g., "user.preferred_theme" (optional)',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'get_recent_memories',
        description: 'Get the most recent memories',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of memories to return (default: 10)',
            },
            category: {
              type: 'string',
              description: 'Optional category filter',
              enum: VALID_CATEGORIES,
            },
          },
        },
      },
      {
        name: 'get_context',
        description: 'Get relevant context for a topic from memory, including both user memories and Echo self-memories',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'The topic to get context for',
            },
          },
          required: ['topic'],
        },
      },
      {
        name: 'get_category_stats',
        description: 'Get statistics about memory categories',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'upsert_fact',
        description: 'Add or update a fact with temporal tracking. If a similar fact exists, it will be superseded.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The fact content',
            },
            category: {
              type: 'string',
              description: 'Category for the fact',
              enum: VALID_CATEGORIES,
            },
            entity: {
              type: 'string',
              description: 'The entity this fact is about',
            },
            factKey: {
              type: 'string',
              description: 'Unique key for this type of fact',
            },
          },
          required: ['content', 'category'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const mem0 = getMem0Client();

  try {
    switch (name) {
      case 'search_memory': {
        const query = args?.query as string;
        const limit = (args?.limit as number) || 5;
        const category = args?.category as string | undefined;

        const results = await mem0.search(query, { user_id: USER_ID });
        let memories = results as Array<{
          id: string;
          memory: string;
          score?: number;
          created_at?: string;
          metadata?: Record<string, unknown>;
        }>;

        // Filter by category if specified
        if (category) {
          memories = memories.filter(m => m.metadata?.category === category);
        }

        memories = memories.slice(0, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                memories.map(m => ({
                  id: m.id,
                  content: m.memory,
                  score: m.score,
                  category: m.metadata?.category,
                  created_at: m.created_at,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'add_memory': {
        const content = args?.content as string;
        const category = args?.category as string;
        const entity = args?.entity as string | undefined;
        const factKey = args?.factKey as string | undefined;

        const metadata: Record<string, unknown> = {
          t_ingested: new Date().toISOString(),
          source: 'mcp',
        };

        if (category) {
          metadata.category = category;
        }
        if (entity) {
          metadata.related_entities = [entity];
        }
        if (factKey) {
          metadata.factKey = factKey;
          metadata.is_current = true;
          metadata.fact_type = 'dynamic';
        }

        await mem0.add(
          [{ role: 'user', content }],
          { user_id: USER_ID, metadata }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Memory added successfully', category }),
            },
          ],
        };
      }

      case 'get_recent_memories': {
        const limit = (args?.limit as number) || 10;
        const category = args?.category as string | undefined;

        const results = await mem0.getAll({ user_id: USER_ID });
        let memories = results as Array<{
          id: string;
          memory: string;
          created_at?: string;
          metadata?: Record<string, unknown>;
        }>;

        // Filter by category if specified
        if (category) {
          memories = memories.filter(m => m.metadata?.category === category);
        }

        // Sort by created_at descending
        memories.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

        memories = memories.slice(0, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                memories.map(m => ({
                  id: m.id,
                  content: m.memory,
                  category: m.metadata?.category,
                  created_at: m.created_at,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_context': {
        const topic = args?.topic as string;

        // Search for relevant memories in parallel
        const [userResults, echoResults] = await Promise.all([
          mem0.search(topic, { user_id: USER_ID }),
          mem0.search(topic, { user_id: ECHO_SELF_ID }),
        ]);

        const userMemories = (userResults as Array<{ memory: string; score?: number; metadata?: Record<string, unknown> }>)
          .slice(0, 5)
          .map(m => ({
            content: m.memory,
            category: m.metadata?.category,
            score: m.score,
          }));

        const echoMemories = (echoResults as Array<{ memory: string; score?: number }>)
          .slice(0, 3)
          .map(m => ({
            content: m.memory,
            score: m.score,
          }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  topic,
                  userMemories,
                  echoContext: echoMemories,
                  totalUserMemories: userMemories.length,
                  totalEchoMemories: echoMemories.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_category_stats': {
        const results = await mem0.getAll({ user_id: USER_ID });
        const memories = results as Array<{ metadata?: Record<string, unknown> }>;

        const stats: Record<string, number> = {};
        for (const cat of VALID_CATEGORIES) {
          stats[cat] = 0;
        }
        stats['uncategorized'] = 0;

        for (const memory of memories) {
          const category = (memory.metadata?.category as string) || 'uncategorized';
          stats[category] = (stats[category] || 0) + 1;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  stats,
                  totalMemories: memories.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'upsert_fact': {
        const content = args?.content as string;
        const category = args?.category as string;
        const entity = args?.entity as string | undefined;
        const factKey = args?.factKey as string | undefined;

        const now = new Date().toISOString();

        // Search for existing facts to supersede
        let supersededId: string | undefined;
        if (entity || factKey) {
          const searchQuery = factKey || `${entity} ${category}`;
          const existing = await mem0.search(searchQuery, { user_id: USER_ID });
          const existingMemories = existing as Array<{
            id: string;
            memory: string;
            metadata?: Record<string, unknown>;
          }>;

          for (const memory of existingMemories) {
            const meta = memory.metadata;
            if (meta?.is_current && meta?.category === category) {
              if (
                (entity && memory.memory.toLowerCase().includes(entity.toLowerCase())) ||
                (factKey && meta.factKey === factKey)
              ) {
                supersededId = memory.id;
                break;
              }
            }
          }
        }

        const metadata: Record<string, unknown> = {
          category,
          t_valid_from: now,
          t_ingested: now,
          is_current: true,
          fact_type: 'dynamic',
          source: 'mcp',
        };

        if (supersededId) {
          metadata.supersedes_memory_id = supersededId;
        }
        if (entity) {
          metadata.related_entities = [entity];
        }
        if (factKey) {
          metadata.factKey = factKey;
        }

        await mem0.add(
          [{ role: 'user', content }],
          { user_id: USER_ID, metadata }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: supersededId
                  ? `Fact added and superseded previous fact ${supersededId}`
                  : 'New fact added',
                superseded: supersededId,
              }),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: String(error) }),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Albert Memory MCP Server running');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
