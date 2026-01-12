/**
 * Gmail OAuth Callback Route
 * Handles the OAuth callback from Google after user authorization
 *
 * GET /api/auth/gmail/callback?code=xxx&state=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { GmailClient } from '@/lib/gmail';
import { saveOAuthToken, initDatabase } from '@/lib/db';

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
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('[Gmail Callback] OAuth error:', error, errorDescription);

      // Redirect to error page or return JSON
      const acceptHeader = request.headers.get('accept') || '';
      if (acceptHeader.includes('text/html')) {
        const errorUrl = new URL('/', request.url);
        errorUrl.searchParams.set('gmail_error', error);
        if (errorDescription) {
          errorUrl.searchParams.set('gmail_error_desc', errorDescription);
        }
        return NextResponse.redirect(errorUrl);
      }

      return NextResponse.json({
        success: false,
        error: error,
        description: errorDescription,
      }, { status: 400 });
    }

    // Validate authorization code
    if (!code) {
      console.error('[Gmail Callback] Missing authorization code');
      return NextResponse.json({
        success: false,
        error: 'Missing authorization code',
      }, { status: 400 });
    }

    // Validate state (CSRF protection)
    if (state !== 'gmail_auth') {
      console.error('[Gmail Callback] Invalid state parameter');
      return NextResponse.json({
        success: false,
        error: 'Invalid state parameter',
      }, { status: 400 });
    }

    // Check credentials
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
      console.error('[Gmail Callback] Missing OAuth credentials');
      return NextResponse.json({
        success: false,
        error: 'Server configuration error: Missing OAuth credentials',
      }, { status: 500 });
    }

    console.log('[Gmail Callback] Exchanging authorization code for tokens');

    // Exchange code for tokens
    const tokens = await GmailClient.exchangeCodeForTokens(
      code,
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      getRedirectUri()
    );

    console.log('[Gmail Callback] Tokens received, fetching user profile');

    // Create a temporary client to get user profile
    const tempClient = new GmailClient({
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt.getTime(),
    });

    // Get the user's email address
    let userEmail = '';
    try {
      const profile = await tempClient.getProfile();
      userEmail = profile.emailAddress;
      console.log('[Gmail Callback] User email:', userEmail);
    } catch (profileError) {
      console.error('[Gmail Callback] Failed to get profile:', profileError);
      // Continue anyway - we have the tokens
    }

    // Use email as userId, or generate a default one for single-user setups
    const userId = userEmail || 'default_user';

    // Save tokens to database
    await saveOAuthToken(
      userId,
      'gmail',
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      tokens.scope,
      userEmail || undefined
    );

    console.log('[Gmail Callback] Tokens saved for user:', userId);

    // Redirect to success page or return JSON
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('text/html')) {
      const successUrl = new URL('/', request.url);
      successUrl.searchParams.set('gmail_connected', 'true');
      if (userEmail) {
        successUrl.searchParams.set('gmail_email', userEmail);
      }
      return NextResponse.redirect(successUrl);
    }

    return NextResponse.json({
      success: true,
      message: 'Gmail authorized successfully',
      email: userEmail || undefined,
      expiresAt: tokens.expiresAt,
    });
  } catch (error) {
    console.error('[Gmail Callback] Error:', error);

    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a token exchange error
    if (errorMessage.includes('invalid_grant')) {
      return NextResponse.json({
        success: false,
        error: 'Authorization expired. Please try again.',
        details: errorMessage,
      }, { status: 400 });
    }

    // Redirect to error page or return JSON
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('text/html')) {
      const errorUrl = new URL('/', request.url);
      errorUrl.searchParams.set('gmail_error', 'auth_failed');
      errorUrl.searchParams.set('gmail_error_desc', errorMessage);
      return NextResponse.redirect(errorUrl);
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to complete Gmail authorization',
      details: errorMessage,
    }, { status: 500 });
  }
}
