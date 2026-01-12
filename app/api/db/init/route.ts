import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';

/**
 * Database Initialization Endpoint
 *
 * This endpoint initializes the database schema. It should be called once
 * after deployment to set up all required tables.
 *
 * Protected by a secret header to prevent unauthorized access.
 * Set INIT_SECRET environment variable to protect this endpoint.
 *
 * Usage:
 * curl -X POST https://your-app.vercel.app/api/db/init \
 *   -H "Authorization: Bearer YOUR_INIT_SECRET"
 */
export async function POST(request: NextRequest) {
  try {
    // Check for authorization if INIT_SECRET is set
    const initSecret = process.env.INIT_SECRET;

    if (initSecret) {
      const authHeader = request.headers.get('Authorization');
      const providedSecret = authHeader?.replace('Bearer ', '');

      if (providedSecret !== initSecret) {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized. Provide valid INIT_SECRET in Authorization header.',
        }, { status: 401 });
      }
    }

    console.log('[DB Init] Starting database initialization...');
    await initDatabase();
    console.log('[DB Init] Database initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DB Init] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize database',
    }, { status: 500 });
  }
}

// Also support GET for easy browser access (with secret in query param)
export async function GET(request: NextRequest) {
  try {
    const initSecret = process.env.INIT_SECRET;

    if (initSecret) {
      const { searchParams } = new URL(request.url);
      const providedSecret = searchParams.get('secret');

      if (providedSecret !== initSecret) {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized. Provide ?secret=YOUR_INIT_SECRET',
        }, { status: 401 });
      }
    }

    console.log('[DB Init] Starting database initialization (GET)...');
    await initDatabase();
    console.log('[DB Init] Database initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DB Init] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize database',
    }, { status: 500 });
  }
}
