import { NextRequest, NextResponse } from 'next/server';
import {
  createBrowserProviderFromEnv,
  BrowserProviderError,
  checkBrowserHealth,
  reportBrowserSuccess,
  reportBrowserFailure,
} from '@/lib/browser';
import { circuitBreakers } from '@/lib/utils/circuitBreaker';
import { timeouts } from '@/lib/config';

// Action-specific timeouts
const ACTION_TIMEOUTS: Record<string, number> = {
  open: timeouts.browserNavigation,
  screenshot: timeouts.browserNavigation,
  click: timeouts.browserNavigation,
  type: timeouts.browserNavigation,
  scroll: timeouts.browserNavigation,
  get_text: timeouts.browserNavigation,
};

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

    // Check circuit breaker first - fail fast if browser is known to be down
    if (!circuitBreakers.browser.isAvailable()) {
      const stats = circuitBreakers.browser.getStats();
      return NextResponse.json({
        success: false,
        error: 'Browser automation is temporarily unavailable. Please try again later.',
        voiceMessage: 'Browser is temporarily unavailable. Please try again in a moment.',
        circuitOpen: true,
        circuitState: stats.state,
      }, { status: 503 });
    }

    // Run health check before attempting operation (uses cached result)
    const health = await checkBrowserHealth();
    if (!health.isHealthy) {
      circuitBreakers.browser.onFailure();
      return NextResponse.json({
        success: false,
        error: health.errorMessage || 'Browser is not available',
        voiceMessage: health.voiceMessage,
        provider: health.provider,
      }, { status: 503 });
    }

    // Create provider from environment (uses Browserbase in production, local CDP in dev)
    provider = createBrowserProviderFromEnv();

    // Get action-specific timeout
    const timeout = ACTION_TIMEOUTS[action] || timeouts.browserNavigation;

    switch (action) {
      case 'open': {
        const url = normalizeUrl(params.url);
        await provider.connect();
        await provider.navigateTo(url, { waitUntil: 'domcontentloaded', timeout });
        const currentUrl = await provider.getCurrentUrl();
        const title = await provider.evaluate(() => document.title);

        // Report success to circuit breaker and health tracker
        circuitBreakers.browser.onSuccess();
        reportBrowserSuccess();

        return NextResponse.json({
          success: true,
          message: `Opened ${url}`,
          title,
          url: currentUrl,
          voiceMessage: `Opened ${title || url}.`,
        });
      }

      case 'screenshot': {
        const url = params.url ? normalizeUrl(params.url) : null;
        await provider.connect();

        if (url) {
          await provider.navigateTo(url, { waitUntil: 'domcontentloaded', timeout });
        }

        const screenshot = await provider.screenshot({ type: 'png' });
        const base64 = screenshot.toString('base64');
        const title = await provider.evaluate(() => document.title);
        const currentUrl = await provider.getCurrentUrl();

        circuitBreakers.browser.onSuccess();
        reportBrowserSuccess();

        return NextResponse.json({
          success: true,
          screenshot: base64,
          title,
          url: currentUrl,
          voiceMessage: `Took a screenshot of ${title || 'the page'}.`,
        });
      }

      case 'click': {
        const { selector, url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for click action in serverless mode',
            voiceMessage: 'I need a URL to click on elements.',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout });
        await provider.click(selector);
        await provider.waitForTimeout(1000); // Wait for any navigation
        const currentUrl = await provider.getCurrentUrl();

        circuitBreakers.browser.onSuccess();
        reportBrowserSuccess();

        return NextResponse.json({
          success: true,
          message: `Clicked on "${selector}"`,
          url: currentUrl,
          voiceMessage: 'Done.',
        });
      }

      case 'type': {
        const { selector, text, url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for type action in serverless mode',
            voiceMessage: 'I need a URL to type into fields.',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout });
        await provider.fill(selector, text);

        circuitBreakers.browser.onSuccess();
        reportBrowserSuccess();

        return NextResponse.json({
          success: true,
          message: `Typed "${text}" into "${selector}"`,
          voiceMessage: 'Done.',
        });
      }

      case 'scroll': {
        const { direction, amount, url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for scroll action in serverless mode',
            voiceMessage: 'I need a URL to scroll.',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout });

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

        circuitBreakers.browser.onSuccess();
        reportBrowserSuccess();

        return NextResponse.json({
          success: true,
          message: `Scrolled ${direction} by ${Math.abs(pixels)} pixels`,
          voiceMessage: `Scrolled ${direction}.`,
        });
      }

      case 'get_text': {
        const { url } = params;

        if (!url) {
          return NextResponse.json({
            success: false,
            error: 'URL is required for get_text action in serverless mode',
            voiceMessage: 'I need a URL to get text from.',
          }, { status: 400 });
        }

        await provider.connect();
        await provider.navigateTo(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout });

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

        circuitBreakers.browser.onSuccess();
        reportBrowserSuccess();

        return NextResponse.json({
          success: true,
          text: (text as string).replace(/\s+/g, ' ').trim(),
          title,
          url: currentUrl,
          voiceMessage: `Got text from ${title || 'the page'}.`,
        });
      }

      case 'status': {
        // Return browser provider status with health check
        const health = await checkBrowserHealth(true); // Force fresh check
        const circuitStats = circuitBreakers.browser.getStats();
        const providerType = process.env.BROWSER_PROVIDER || 'local-cdp';

        return NextResponse.json({
          success: true,
          provider: health.provider || providerType,
          isHealthy: health.isHealthy,
          browserbaseConfigured: !!process.env.BROWSERBASE_API_KEY,
          circuitBreaker: {
            state: circuitStats.state,
            failures: circuitStats.failures,
            isOpen: !circuitBreakers.browser.isAvailable(),
          },
          message: health.isHealthy
            ? `Browser ready (${health.provider || providerType})`
            : health.errorMessage || 'Browser unavailable',
          voiceMessage: health.voiceMessage,
        });
      }

      case 'health': {
        // Quick health check endpoint
        const health = await checkBrowserHealth();
        return NextResponse.json({
          success: health.isHealthy,
          isHealthy: health.isHealthy,
          provider: health.provider,
          voiceMessage: health.voiceMessage,
          error: health.errorMessage,
        }, { status: health.isHealthy ? 200 : 503 });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}. Available actions: open, screenshot, click, type, scroll, get_text, status`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Browser API] Error:', error);

    // Report failure to circuit breaker and health tracker
    circuitBreakers.browser.onFailure();
    reportBrowserFailure(error instanceof Error ? error : undefined);

    const errorMessage = error instanceof BrowserProviderError
      ? `${error.message} (${error.code})`
      : error instanceof Error
      ? error.message
      : 'Browser operation failed';

    // Generate voice-friendly error message
    let voiceMessage = 'The browser operation failed.';
    if (error instanceof BrowserProviderError) {
      switch (error.code) {
        case 'CONNECTION_FAILED':
          voiceMessage = 'I could not connect to the browser. Please make sure Chrome is running.';
          break;
        case 'NOT_CONNECTED':
          voiceMessage = 'The browser connection was lost. Please try again.';
          break;
        case 'NAVIGATION_FAILED':
          voiceMessage = 'I could not open that page. The site might be slow or unavailable.';
          break;
        case 'SELECTOR_NOT_FOUND':
          voiceMessage = 'I could not find that element on the page.';
          break;
        case 'SCREENSHOT_FAILED':
          voiceMessage = 'I could not take a screenshot.';
          break;
        default:
          voiceMessage = 'Something went wrong with the browser.';
      }
    } else if (error instanceof Error && error.message.includes('timeout')) {
      voiceMessage = 'The operation timed out. The page might be slow.';
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
      voiceMessage,
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
