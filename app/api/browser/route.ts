import { NextRequest, NextResponse } from 'next/server';
import { chromium, Browser, Page } from 'playwright';

// Store browser instance globally for reuse
let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;

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

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: false, // Show the browser window
      args: ['--start-maximized'],
    });
  }
  return browserInstance;
}

async function getPage(): Promise<Page> {
  const browser = await getBrowser();

  if (!pageInstance || pageInstance.isClosed()) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    pageInstance = await context.newPage();
  }

  return pageInstance;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'open': {
        const url = normalizeUrl(params.url);
        const page = await getPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        return NextResponse.json({
          success: true,
          message: `Opened ${url}`,
          title,
          url: page.url(),
        });
      }

      case 'screenshot': {
        if (!pageInstance || pageInstance.isClosed()) {
          return NextResponse.json({
            success: false,
            error: 'No browser page is open. Open a website first.',
          });
        }
        const screenshot = await pageInstance.screenshot({ type: 'png' });
        const base64 = screenshot.toString('base64');
        const title = await pageInstance.title();
        return NextResponse.json({
          success: true,
          screenshot: base64,
          title,
          url: pageInstance.url(),
        });
      }

      case 'click': {
        if (!pageInstance || pageInstance.isClosed()) {
          return NextResponse.json({
            success: false,
            error: 'No browser page is open. Open a website first.',
          });
        }
        const { selector } = params;
        await pageInstance.click(selector, { timeout: 10000 });
        await pageInstance.waitForLoadState('domcontentloaded');
        return NextResponse.json({
          success: true,
          message: `Clicked on "${selector}"`,
          url: pageInstance.url(),
        });
      }

      case 'type': {
        if (!pageInstance || pageInstance.isClosed()) {
          return NextResponse.json({
            success: false,
            error: 'No browser page is open. Open a website first.',
          });
        }
        const { selector, text } = params;
        await pageInstance.fill(selector, text, { timeout: 10000 });
        return NextResponse.json({
          success: true,
          message: `Typed "${text}" into "${selector}"`,
        });
      }

      case 'scroll': {
        if (!pageInstance || pageInstance.isClosed()) {
          return NextResponse.json({
            success: false,
            error: 'No browser page is open. Open a website first.',
          });
        }
        const { direction, amount } = params;
        let pixels = 500; // default
        if (amount === 'page') {
          pixels = 800;
        } else if (amount === 'half') {
          pixels = 400;
        } else if (!isNaN(parseInt(amount))) {
          pixels = parseInt(amount);
        }

        if (direction === 'up') {
          pixels = -pixels;
        }

        await pageInstance.evaluate((scrollAmount) => {
          window.scrollBy(0, scrollAmount);
        }, pixels);

        return NextResponse.json({
          success: true,
          message: `Scrolled ${direction} by ${Math.abs(pixels)} pixels`,
        });
      }

      case 'close': {
        if (pageInstance && !pageInstance.isClosed()) {
          await pageInstance.close();
          pageInstance = null;
        }
        if (browserInstance && browserInstance.isConnected()) {
          await browserInstance.close();
          browserInstance = null;
        }
        return NextResponse.json({
          success: true,
          message: 'Browser closed',
        });
      }

      case 'get_text': {
        if (!pageInstance || pageInstance.isClosed()) {
          return NextResponse.json({
            success: false,
            error: 'No browser page is open. Open a website first.',
          });
        }
        // Get main content text
        const text = await pageInstance.evaluate(() => {
          // Try to get main content first
          const main = document.querySelector('main, article, [role="main"]');
          if (main) {
            return main.textContent?.slice(0, 5000) || '';
          }
          // Fall back to body
          return document.body.textContent?.slice(0, 5000) || '';
        });

        return NextResponse.json({
          success: true,
          text: text.replace(/\s+/g, ' ').trim(),
          title: await pageInstance.title(),
          url: pageInstance.url(),
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Browser API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Browser operation failed',
    }, { status: 500 });
  }
}

// Cleanup on server shutdown
process.on('beforeExit', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
});
