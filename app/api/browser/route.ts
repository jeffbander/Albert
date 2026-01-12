import { NextRequest, NextResponse } from 'next/server';
import { createBrowserProviderFromEnv, BrowserProviderError } from '@/lib/browser';

// Common site shortcuts
const SITE_SHORTCUTS: Record<string, string> = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  twitter: 'https://twitter.com',
  x: 'https://twitter.com',
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  linkedin: 'https://www.linkedin.com',
  github: 'https://github.com',
  reddit: 'https://www.reddit.com',
  amazon: 'https://www.amazon.com',
  netflix: 'https://www.netflix.com',
  cnn: 'https://www.cnn.com',
  bbc: 'https://www.bbc.com',
  nytimes: 'https://www.nytimes.com',
  wikipedia: 'https://www.wikipedia.org',
  stackoverflow: 'https://stackoverflow.com',
  twitch: 'https://www.twitch.tv',
  spotify: 'https://open.spotify.com',
  discord: 'https://discord.com',
  slack: 'https://slack.com',
};

function normalizeUrl(input: string): string {
  const lowered = input.toLowerCase().trim();

  // Check for shortcut
  if (SITE_SHORTCUTS[lowered]) {
    return SITE_SHORTCUTS[lowered];
  }

  // Add protocol if missing
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    return `https://${input}`;
  }

  return input;
}

export async function POST(request: NextRequest) {
  let provider = null;

  try {
    const body = await request.json();
    const { action, ...params } = body;

    // Create provider from environment (uses Browserbase in production, local CDP in dev)
    provider = createBrowserProviderFromEnv();

    switch (action) {
      case 'open': {
        const url = normalizeUrl(params.url);
        await provider.connect();
        await provider.navigateTo(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const currentUrl = await provider.getCurrentUrl();
        const title = await provider.evaluate(() => document.title);

        return NextResponse.json({
          success: true,
          message: `Opened ${url}`,
          title,
          url: currentUrl,
        });
      }

      case 'screenshot': {
        const url = params.url ? normalizeUrl(params.url) : null;
        await provider.connect();

        if (url) {
          await provider.navigateTo(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        const screenshot = await provider.screenshot({ type: 'png' });
        const base64 = screenshot.toString('base64');
        const title = await provider.evaluate(() => document.title);
        const currentUrl = await provider.getCurrentUrl();

        return NextResponse.json({
          success: true,
          screenshot: base64,
          title,
          url: currentUrl,
        });
      }

      case 'click': {
        const { selector, url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for click action in serverless mode',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await provider.click(selector);
        await provider.waitForTimeout(1000); // Wait for any navigation
        const currentUrl = await provider.getCurrentUrl();

        return NextResponse.json({
          success: true,
          message: `Clicked on "${selector}"`,
          url: currentUrl,
        });
      }

      case 'type': {
        const { selector, text, url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for type action in serverless mode',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await provider.fill(selector, text);

        return NextResponse.json({
          success: true,
          message: `Typed "${text}" into "${selector}"`,
        });
      }

      case 'scroll': {
        const { direction, amount, url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for scroll action in serverless mode',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 30000 });

        let pixels = 500; // default
        if (amount === 'page') {
          pixels = 800;
        } else if (amount === 'half') {
          pixels = 400;
        } else if (!isNaN(parseInt(amount))) {
          pixels = parseInt(amount);
        }

        const deltaY = direction === 'up' ? -pixels : pixels;
        await provider.scroll(0, deltaY);

        return NextResponse.json({
          success: true,
          message: `Scrolled ${direction} by ${Math.abs(pixels)} pixels`,
        });
      }

      case 'get_text': {
        const { url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for get_text action in serverless mode',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Get main content text
        const text = await provider.evaluate(() => {
          // Try to get main content first
          const main = document.querySelector('main, article, [role="main"]');
          if (main) {
            return main.textContent?.slice(0, 5000) || '';
          }
          // Fall back to body
          return document.body.textContent?.slice(0, 5000) || '';
        });

        const title = await provider.evaluate(() => document.title);
        const currentUrl = await provider.getCurrentUrl();

        return NextResponse.json({
          success: true,
          text: (text as string).replace(/\s+/g, ' ').trim(),
          title,
          url: currentUrl,
        });
      }

      case 'status': {
        // Return browser provider status without connecting
        const providerType = process.env.BROWSER_PROVIDER || 'local-cdp';
        return NextResponse.json({
          success: true,
          provider: providerType,
          browserbaseConfigured: !!process.env.BROWSERBASE_API_KEY,
          message: `Browser provider: ${providerType}`,
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}. Available actions: open, screenshot, click, type, scroll, get_text, status`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Browser API] Error:', error);

    const errorMessage = error instanceof BrowserProviderError
      ? `${error.message} (${error.code})`
      : error instanceof Error
      ? error.message
      : 'Browser operation failed';

    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  } finally {
    // Always disconnect the provider to clean up resources
    if (provider) {
      try {
        await provider.disconnect();
      } catch (e) {
        console.warn('[Browser API] Error disconnecting provider:', e);
      }
    }
  }
}
