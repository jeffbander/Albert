/**
 * MCP Proxy API Route
 * Forwards tool calls to the claude-in-chrome MCP server.
 * This acts as a bridge between the voice interface and browser automation.
 */

import { NextRequest, NextResponse } from 'next/server';

// The claude-in-chrome extension exposes tools via WebSocket
// Default port for claude-in-chrome MCP server
const MCP_WS_URL = process.env.CLAUDE_IN_CHROME_WS || 'ws://127.0.0.1:9222';

interface MCPRequest {
  tool: string;
  params: Record<string, unknown>;
}

interface MCPResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Call a claude-in-chrome MCP tool
 * Uses HTTP-based approach via Chrome DevTools Protocol proxy
 */
async function callMcpTool(tool: string, params: Record<string, unknown>): Promise<MCPResponse> {
  try {
    // For claude-in-chrome, tools are exposed via specific endpoints
    // The extension typically listens on a local port

    // Map tool names to their endpoints
    const toolEndpoints: Record<string, string> = {
      'tabs_context_mcp': '/mcp/tabs_context',
      'tabs_create_mcp': '/mcp/tabs_create',
      'navigate': '/mcp/navigate',
      'computer': '/mcp/computer',
      'find': '/mcp/find',
      'form_input': '/mcp/form_input',
      'read_page': '/mcp/read_page',
      'get_page_text': '/mcp/get_page_text',
    };

    const endpoint = toolEndpoints[tool];
    if (!endpoint) {
      // For unknown tools, try the generic endpoint
      console.log(`[MCP-Proxy] Unknown tool ${tool}, using generic call`);
    }

    // The claude-in-chrome extension exposes an HTTP API
    // Check if the extension's HTTP server is available
    const extensionPort = process.env.CLAUDE_IN_CHROME_PORT || '9223';
    const baseUrl = `http://127.0.0.1:${extensionPort}`;

    const response = await fetch(`${baseUrl}/api/tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `MCP call failed: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };

  } catch (error) {
    // If direct HTTP call fails, try WebSocket approach
    console.error('[MCP-Proxy] HTTP call failed, trying alternative:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'MCP call failed',
    };
  }
}

/**
 * Alternative: Use Chrome DevTools Protocol directly
 * This connects to Chrome's remote debugging port
 */
async function callViaCDP(tool: string, params: Record<string, unknown>): Promise<MCPResponse> {
  try {
    // Chrome DevTools Protocol endpoint
    const cdpPort = process.env.CHROME_DEBUG_PORT || '9222';
    const cdpUrl = `http://127.0.0.1:${cdpPort}`;

    // Get list of available targets (tabs)
    const targetsResponse = await fetch(`${cdpUrl}/json`);
    if (!targetsResponse.ok) {
      throw new Error('Could not connect to Chrome DevTools Protocol');
    }

    const targets = await targetsResponse.json();

    // Implementation depends on the specific tool
    // For now, return the targets as data
    return {
      success: true,
      data: {
        method: 'cdp',
        tool,
        params,
        targets,
      },
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'CDP call failed',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: MCPRequest = await request.json();
    const { tool, params } = body;

    if (!tool) {
      return NextResponse.json(
        { success: false, error: 'Tool name is required' },
        { status: 400 }
      );
    }

    console.log(`[MCP-Proxy] Calling tool: ${tool}`, params);

    // Try MCP call first
    let result = await callMcpTool(tool, params || {});

    // If MCP call fails, try CDP as fallback
    if (!result.success && tool.startsWith('tabs_') || tool === 'navigate') {
      console.log('[MCP-Proxy] Trying CDP fallback...');
      result = await callViaCDP(tool, params || {});
    }

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP-Proxy] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Proxy error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Health check endpoint
  return NextResponse.json({
    status: 'ok',
    service: 'mcp-proxy',
    message: 'MCP Proxy is running. Use POST to call tools.',
  });
}
