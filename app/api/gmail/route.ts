/**
 * Gmail API Route
 * Handles email operations via the direct Gmail API client (serverless-compatible)
 * Supports: send, read, search, draft, reply, and status checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { GmailClient } from '@/lib/gmail';
import type { GmailCredentials } from '@/lib/gmail';
import {
  createPendingEmail,
  getPendingEmail,
  markPendingEmailSent,
  getContactByName,
  getOAuthTokenByProvider,
  updateOAuthTokenAccess,
  initDatabase,
} from '@/lib/db';

// Initialize database on module load
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

// Check if Gmail OAuth is configured via environment or database
async function isGmailConfigured(): Promise<boolean> {
  // Check for environment-based configuration
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) {
    // Check if we have a stored token
    await ensureDbInitialized();
    const token = await getOAuthTokenByProvider('gmail');
    return token !== null;
  }
  return false;
}

// Get Gmail credentials from database
async function getGmailCredentials(): Promise<GmailCredentials | null> {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    console.error('[Gmail] Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET');
    return null;
  }

  await ensureDbInitialized();
  const token = await getOAuthTokenByProvider('gmail');

  if (!token) {
    console.error('[Gmail] No OAuth token found in database');
    return null;
  }

  return {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: token.refreshToken,
    accessToken: token.accessToken,
    expiresAt: token.expiresAt.getTime(),
  };
}

// Create Gmail client with token refresh handling
async function createGmailClient(): Promise<GmailClient | null> {
  const credentials = await getGmailCredentials();
  if (!credentials) return null;

  return new GmailClient(credentials, {
    onTokenRefresh: async (tokens) => {
      // Update token in database when refreshed
      const existingToken = await getOAuthTokenByProvider('gmail');
      if (existingToken) {
        await updateOAuthTokenAccess(
          existingToken.userId,
          'gmail',
          tokens.accessToken,
          tokens.expiresAt,
          tokens.refreshToken
        );
        console.log('[Gmail] Token refreshed and saved');
      }
    },
  });
}

// Resolve a name to email address using contacts database
async function resolveRecipient(recipient: string): Promise<string> {
  // If it's already an email address, return as-is
  if (recipient.includes('@')) {
    return recipient;
  }

  // Try to look up in contacts
  await ensureDbInitialized();
  const contact = await getContactByName(recipient);
  if (contact) {
    console.log(`[Gmail] Resolved "${recipient}" to ${contact.email}`);
    return contact.email;
  }

  // Return as-is if not found (will likely fail at Gmail level)
  console.warn(`[Gmail] Could not resolve "${recipient}" to email address`);
  return recipient;
}

// Format email for voice reading
function formatEmailForVoice(email: {
  from: string;
  subject: string;
  snippet: string;
  date: Date;
}): string {
  const fromName = email.from.split('<')[0].trim() || email.from;
  const dateStr = email.date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `From ${fromName} on ${dateStr}: ${email.subject}. ${email.snippet}`;
}

export async function POST(request: NextRequest) {
  try {
    // Check if Gmail is configured
    const configured = await isGmailConfigured();
    if (!configured) {
      const authUrl = process.env.GMAIL_CLIENT_ID
        ? `/api/auth/gmail?action=authorize`
        : null;

      return NextResponse.json(
        {
          success: false,
          error: 'Gmail is not configured. Please authenticate with Google.',
          needsSetup: true,
          authUrl,
          setupInstructions: !process.env.GMAIL_CLIENT_ID
            ? 'Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables, then visit /api/auth/gmail to authorize.'
            : 'Visit the authUrl to authorize Gmail access.',
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { action, ...params } = body;

    console.log(`[Gmail API] Action: ${action}`, params);

    // Create Gmail client
    const gmail = await createGmailClient();
    if (!gmail) {
      return NextResponse.json(
        { success: false, error: 'Failed to initialize Gmail client' },
        { status: 500 }
      );
    }

    switch (action) {
      // Compose email and create pending (for confirmation flow)
      case 'compose': {
        const toAddress = await resolveRecipient(params.to);
        await ensureDbInitialized();
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
        await ensureDbInitialized();
        const pendingEmail = await getPendingEmail(params.pendingId);
        if (!pendingEmail) {
          return NextResponse.json(
            { success: false, error: 'Pending email not found or expired' },
            { status: 404 }
          );
        }

        // Send via Gmail API
        const messageId = await gmail.sendEmail({
          to: pendingEmail.toAddress,
          subject: pendingEmail.subject,
          body: pendingEmail.body,
          cc: pendingEmail.cc || undefined,
        });

        // Mark as sent
        await markPendingEmailSent(params.pendingId);

        return NextResponse.json({
          success: true,
          messageId,
          message: `Email sent to ${pendingEmail.toAddress}`,
        });
      }

      // Direct send (skips confirmation - use with caution)
      case 'send': {
        const toAddress = await resolveRecipient(params.to);
        const messageId = await gmail.sendEmail({
          to: toAddress,
          subject: params.subject,
          body: params.body,
          cc: params.cc,
          bcc: params.bcc,
        });
        return NextResponse.json({
          success: true,
          messageId,
          message: `Email sent to ${toAddress}`,
        });
      }

      // Read recent emails or search
      case 'read': {
        const query = params.query || 'in:inbox';
        const maxResults = parseInt(params.maxResults) || 5;
        const result = await gmail.readEmails({
          query,
          maxResults,
        });

        // Format for voice response
        const emailSummaries = result.emails.map(formatEmailForVoice);

        return NextResponse.json({
          success: true,
          emails: result.emails.map((e) => ({
            id: e.id,
            threadId: e.threadId,
            from: e.from,
            to: e.to,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            isRead: e.isRead,
            labels: e.labels,
          })),
          count: result.emails.length,
          query,
          voiceSummary:
            result.emails.length > 0
              ? `You have ${result.emails.length} email${result.emails.length > 1 ? 's' : ''}. ${emailSummaries.slice(0, 3).join(' ')}`
              : 'No emails found matching your query.',
        });
      }

      // Read a specific email by ID
      case 'read_one': {
        const email = await gmail.getEmail(params.messageId);
        return NextResponse.json({
          success: true,
          email: {
            id: email.id,
            threadId: email.threadId,
            from: email.from,
            to: email.to,
            cc: email.cc,
            subject: email.subject,
            body: email.body,
            snippet: email.snippet,
            date: email.date,
            isRead: email.isRead,
            labels: email.labels,
            hasAttachments: email.hasAttachments,
          },
        });
      }

      // Search emails
      case 'search': {
        const maxResults = parseInt(params.maxResults) || 10;
        const emails = await gmail.searchEmails(params.query, maxResults);
        return NextResponse.json({
          success: true,
          emails: emails.map((e) => ({
            id: e.id,
            threadId: e.threadId,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            isRead: e.isRead,
          })),
          count: emails.length,
          query: params.query,
        });
      }

      // Create draft
      case 'draft': {
        const toAddress = await resolveRecipient(params.to);
        const draft = await gmail.createDraft({
          to: toAddress,
          subject: params.subject,
          body: params.body,
        });
        return NextResponse.json({
          success: true,
          draftId: draft.id,
          message: `Draft created for ${toAddress}`,
        });
      }

      // Reply to email
      case 'reply': {
        const messageId = await gmail.replyToEmail(
          params.messageId,
          params.body,
          { replyAll: params.replyAll === true }
        );
        return NextResponse.json({
          success: true,
          messageId,
          message: 'Reply sent',
        });
      }

      // List labels
      case 'labels': {
        const labels = await gmail.getLabels();
        return NextResponse.json({
          success: true,
          labels: labels.map((l) => ({
            id: l.id,
            name: l.name,
            type: l.type,
          })),
        });
      }

      // Modify labels (archive, star, mark read/unread)
      case 'modify_labels': {
        await gmail.modifyLabels(params.messageId, {
          addLabelIds: params.addLabels,
          removeLabelIds: params.removeLabels,
        });
        return NextResponse.json({
          success: true,
          message: 'Labels modified',
        });
      }

      // Mark as read
      case 'mark_read': {
        await gmail.markAsRead(params.messageId);
        return NextResponse.json({
          success: true,
          message: 'Email marked as read',
        });
      }

      // Mark as unread
      case 'mark_unread': {
        await gmail.markAsUnread(params.messageId);
        return NextResponse.json({
          success: true,
          message: 'Email marked as unread',
        });
      }

      // Archive email
      case 'archive': {
        await gmail.archiveEmail(params.messageId);
        return NextResponse.json({
          success: true,
          message: 'Email archived',
        });
      }

      // Star email
      case 'star': {
        await gmail.starEmail(params.messageId);
        return NextResponse.json({
          success: true,
          message: 'Email starred',
        });
      }

      // Trash email
      case 'trash': {
        await gmail.trashEmail(params.messageId);
        return NextResponse.json({
          success: true,
          message: 'Email moved to trash',
        });
      }

      // Get thread
      case 'thread': {
        const emails = await gmail.getThread(params.threadId);
        return NextResponse.json({
          success: true,
          thread: emails.map((e) => ({
            id: e.id,
            from: e.from,
            to: e.to,
            subject: e.subject,
            body: e.body,
            date: e.date,
          })),
          count: emails.length,
        });
      }

      // Check configuration status
      case 'status': {
        const isConfigured = await isGmailConfigured();
        let profile = null;
        if (isConfigured) {
          try {
            profile = await gmail.getProfile();
          } catch (e) {
            console.error('[Gmail] Failed to get profile:', e);
          }
        }
        return NextResponse.json({
          success: true,
          configured: isConfigured,
          profile,
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

    // Handle specific error types
    const gmailError = error as { code?: number; message?: string };

    if (gmailError.code === 401) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gmail authentication expired. Please re-authorize.',
          needsReauth: true,
          authUrl: '/api/auth/gmail?action=authorize',
        },
        { status: 401 }
      );
    }

    if (gmailError.code === 429) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gmail rate limit exceeded. Please try again in a moment.',
          retryAfter: 60,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Gmail operation failed',
      },
      { status: 500 }
    );
  }
}

// GET: Check Gmail configuration status and get auth URL
export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Get authorization URL
    if (action === 'auth_url') {
      if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
        return NextResponse.json({
          success: false,
          error: 'Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.',
        });
      }

      const redirectUri =
        process.env.GMAIL_REDIRECT_URI ||
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/gmail/callback`;

      const authUrl = GmailClient.getAuthUrl(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        redirectUri,
        'gmail_auth'
      );

      return NextResponse.json({
        success: true,
        authUrl,
        redirectUri,
      });
    }

    // Default: status check
    const configured = await isGmailConfigured();
    const token = configured ? await getOAuthTokenByProvider('gmail') : null;

    return NextResponse.json({
      success: true,
      configured,
      email: token?.email || null,
      expiresAt: token?.expiresAt || null,
      hasCredentials: !!(
        process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET
      ),
      authUrl: !configured ? '/api/auth/gmail?action=authorize' : undefined,
    });
  } catch (error) {
    console.error('[Gmail API] Status check error:', error);
    return NextResponse.json({
      success: false,
      configured: false,
      error: error instanceof Error ? error.message : 'Status check failed',
    });
  }
}
