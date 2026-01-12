/**
 * Gmail OAuth Authorization Route
 * Handles the OAuth flow initiation for Gmail
 *
 * GET /api/auth/gmail - Check auth status or initiate OAuth
 * GET /api/auth/gmail?action=authorize - Redirect to Google OAuth
 * GET /api/auth/gmail?action=logout - Revoke tokens and logout
 */

import { NextRequest, NextResponse } from 'next/server';
import { GmailClient } from '@/lib/gmail';
import {
  getOAuthTokenByProvider,
  deleteOAuthToken,
  initDatabase,
} from '@/lib/db';

// Initialize database
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

function getRedirectUri(): string {
  return (
    process.env.GMAIL_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/gmail/callback`
  );
}

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Check if credentials are configured
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
      return NextResponse.json({
        success: false,
        error: 'Gmail OAuth not configured',
        instructions: [
          '1. Go to Google Cloud Console (https://console.cloud.google.com)',
          '2. Create a new project or select existing',
          '3. Enable Gmail API',
          '4. Configure OAuth consent screen',
          '5. Create OAuth 2.0 credentials (Web application)',
          '6. Add authorized redirect URI: ' + getRedirectUri(),
          '7. Set environment variables:',
          '   - GMAIL_CLIENT_ID=your_client_id',
          '   - GMAIL_CLIENT_SECRET=your_client_secret',
          '   - GMAIL_REDIRECT_URI=' + getRedirectUri() + ' (optional)',
        ],
      }, { status: 503 });
    }

    // Handle logout/revoke
    if (action === 'logout' || action === 'revoke') {
      const token = await getOAuthTokenByProvider('gmail');
      if (token) {
        await deleteOAuthToken(token.userId, 'gmail');
        console.log('[Gmail Auth] Token revoked for user:', token.userId);
      }

      // Redirect to home or return JSON based on Accept header
      const acceptHeader = request.headers.get('accept') || '';
      if (acceptHeader.includes('text/html')) {
        return NextResponse.redirect(new URL('/', request.url));
      }

      return NextResponse.json({
        success: true,
        message: 'Gmail authorization revoked',
      });
    }

    // Handle authorize - redirect to Google OAuth
    if (action === 'authorize') {
      const authUrl = GmailClient.getAuthUrl(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        getRedirectUri(),
        'gmail_auth'
      );

      console.log('[Gmail Auth] Redirecting to Google OAuth');
      return NextResponse.redirect(authUrl);
    }

    // Default: return auth status
    const token = await getOAuthTokenByProvider('gmail');
    const isAuthenticated = token !== null;

    if (!isAuthenticated) {
      // Generate auth URL for unauthenticated users
      const authUrl = GmailClient.getAuthUrl(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        getRedirectUri(),
        'gmail_auth'
      );

      return NextResponse.json({
        success: true,
        authenticated: false,
        message: 'Gmail not authorized',
        authUrl,
        instructions: 'Visit the authUrl to authorize Gmail access',
      });
    }

    // Return authenticated status
    return NextResponse.json({
      success: true,
      authenticated: true,
      email: token.email,
      expiresAt: token.expiresAt,
      lastUpdated: token.updatedAt,
    });
  } catch (error) {
    console.error('[Gmail Auth] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Auth check failed',
    }, { status: 500 });
  }
}
