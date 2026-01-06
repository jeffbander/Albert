/**
 * Gmail API Route
 * Handles email operations via the Gmail MCP server
 * Supports: send, read, search, draft, reply, and status checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createPendingEmail,
  getPendingEmail,
  markPendingEmailSent,
  getContactByName,
} from '@/lib/db';

// Check if Gmail MCP credentials are configured
function isGmailConfigured(): boolean {
  const credPath = path.join(os.homedir(), '.gmail-mcp', 'credentials.json');
  return fs.existsSync(credPath);
}

// Call Gmail MCP server tool via CLI
async function callGmailMcp(
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const mcpArgs = [
      '@gongrzhe/server-gmail-autoauth-mcp',
      'call',
      tool,
      JSON.stringify(args),
    ];

    console.log(`[Gmail MCP] Calling tool: ${tool}`, args);

    const child = spawn('npx', mcpArgs, {
      env: { ...process.env },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      console.log(`[Gmail MCP] Tool ${tool} exited with code ${code}`);
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ raw: stdout.trim() });
        }
      } else {
        console.error(`[Gmail MCP] Error:`, stderr);
        reject(new Error(stderr || `Gmail MCP exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      console.error(`[Gmail MCP] Spawn error:`, err);
      reject(err);
    });
  });
}

// Resolve a name to email address using contacts database
async function resolveRecipient(recipient: string): Promise<string> {
  // If it's already an email address, return as-is
  if (recipient.includes('@')) {
    return recipient;
  }

  // Try to look up in contacts
  const contact = await getContactByName(recipient);
  if (contact) {
    console.log(`[Gmail] Resolved "${recipient}" to ${contact.email}`);
    return contact.email;
  }

  // Return as-is if not found (will likely fail at Gmail level)
  console.warn(`[Gmail] Could not resolve "${recipient}" to email address`);
  return recipient;
}

export async function POST(request: NextRequest) {
  try {
    // Check if Gmail is configured
    if (!isGmailConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gmail is not configured. Please run: npx @gongrzhe/server-gmail-autoauth-mcp auth',
          needsSetup: true,
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { action, ...params } = body;

    console.log(`[Gmail API] Action: ${action}`, params);

    switch (action) {
      // Compose email and create pending (for confirmation flow)
      case 'compose': {
        const toAddress = await resolveRecipient(params.to);
        const pendingId = await createPendingEmail(
          toAddress,
          params.subject,
          params.body,
          params.cc
        );
        return NextResponse.json({
          success: true,
          pendingId,
          to: toAddress,
          subject: params.subject,
          bodyPreview: params.body.slice(0, 200),
          message: `Email composed. Waiting for confirmation to send to ${toAddress}.`,
        });
      }

      // Confirm and send a pending email
      case 'confirm_send': {
        const pendingEmail = await getPendingEmail(params.pendingId);
        if (!pendingEmail) {
          return NextResponse.json(
            { success: false, error: 'Pending email not found or expired' },
            { status: 404 }
          );
        }

        // Send via Gmail MCP
        const result = await callGmailMcp('send_email', {
          to: pendingEmail.toAddress,
          subject: pendingEmail.subject,
          body: pendingEmail.body,
          cc: pendingEmail.cc,
        });

        // Mark as sent
        await markPendingEmailSent(params.pendingId);

        return NextResponse.json({
          success: true,
          result,
          message: `Email sent to ${pendingEmail.toAddress}`,
        });
      }

      // Direct send (skips confirmation - use with caution)
      case 'send': {
        const toAddress = await resolveRecipient(params.to);
        const result = await callGmailMcp('send_email', {
          to: toAddress,
          subject: params.subject,
          body: params.body,
          cc: params.cc,
          bcc: params.bcc,
        });
        return NextResponse.json({
          success: true,
          result,
          message: `Email sent to ${toAddress}`,
        });
      }

      // Read recent emails or search
      case 'read': {
        const query = params.query || 'is:inbox';
        const maxResults = parseInt(params.maxResults) || 5;
        const result = await callGmailMcp('search_emails', {
          query,
          maxResults,
        });
        return NextResponse.json({
          success: true,
          emails: result,
          query,
        });
      }

      // Read a specific email by ID
      case 'read_one': {
        const result = await callGmailMcp('read_email', {
          messageId: params.messageId,
        });
        return NextResponse.json({
          success: true,
          email: result,
        });
      }

      // Search emails
      case 'search': {
        const maxResults = parseInt(params.maxResults) || 10;
        const result = await callGmailMcp('search_emails', {
          query: params.query,
          maxResults,
        });
        return NextResponse.json({
          success: true,
          emails: result,
          query: params.query,
        });
      }

      // Create draft
      case 'draft': {
        const toAddress = await resolveRecipient(params.to);
        const result = await callGmailMcp('draft_email', {
          to: toAddress,
          subject: params.subject,
          body: params.body,
        });
        return NextResponse.json({
          success: true,
          result,
          message: `Draft created for ${toAddress}`,
        });
      }

      // Reply to email
      case 'reply': {
        const result = await callGmailMcp('reply_to_email', {
          messageId: params.messageId,
          body: params.body,
        });
        return NextResponse.json({
          success: true,
          result,
          message: 'Reply sent',
        });
      }

      // List labels
      case 'labels': {
        const result = await callGmailMcp('list_email_labels', {});
        return NextResponse.json({
          success: true,
          labels: result,
        });
      }

      // Modify labels (archive, star, mark read/unread)
      case 'modify_labels': {
        const result = await callGmailMcp('modify_email_labels', {
          messageId: params.messageId,
          addLabels: params.addLabels,
          removeLabels: params.removeLabels,
        });
        return NextResponse.json({
          success: true,
          result,
        });
      }

      // Check configuration status
      case 'status': {
        return NextResponse.json({
          success: true,
          configured: isGmailConfigured(),
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Gmail API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Gmail operation failed',
      },
      { status: 500 }
    );
  }
}

// GET: Check Gmail configuration status
export async function GET() {
  try {
    const configured = isGmailConfigured();
    const credPath = path.join(os.homedir(), '.gmail-mcp', 'credentials.json');

    return NextResponse.json({
      success: true,
      configured,
      credentialsPath: credPath,
      setupCommand: 'npx @gongrzhe/server-gmail-autoauth-mcp auth',
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      configured: false,
      error: error instanceof Error ? error.message : 'Status check failed',
    });
  }
}
