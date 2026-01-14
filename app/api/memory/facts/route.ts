import { NextRequest, NextResponse } from 'next/server';
import {
  upsertFact,
  getCurrentFact,
  getFactHistory,
  invalidateFact,
  type MemoryCategory,
} from '@/lib/mem0';

const VALID_CATEGORIES: MemoryCategory[] = [
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

function isValidCategory(category: string): category is MemoryCategory {
  return VALID_CATEGORIES.includes(category as MemoryCategory);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const category = searchParams.get('category');
  const type = searchParams.get('type') || 'current'; // 'current', 'history'

  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 });
  }

  try {
    const validCategory = category && isValidCategory(category) ? category : undefined;

    if (type === 'history') {
      const history = await getFactHistory(query, validCategory);
      return NextResponse.json({ history });
    }

    const fact = await getCurrentFact(query, validCategory);
    return NextResponse.json({ fact });
  } catch (error) {
    console.error('Error fetching fact:', error);
    return NextResponse.json({ error: 'Failed to fetch fact' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, category, entity, factKey, validFrom, ...metadata } = body;

    if (!content || !category) {
      return NextResponse.json(
        { error: 'content and category required' },
        { status: 400 }
      );
    }

    if (!isValidCategory(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const result = await upsertFact({
      content,
      category,
      entity,
      factKey,
      validFrom,
      metadata,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error upserting fact:', error);
    return NextResponse.json({ error: 'Failed to upsert fact' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const memoryId = searchParams.get('memoryId');
  const reason = searchParams.get('reason');

  if (!memoryId) {
    return NextResponse.json({ error: 'memoryId required' }, { status: 400 });
  }

  try {
    await invalidateFact(memoryId, reason || undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error invalidating fact:', error);
    return NextResponse.json({ error: 'Failed to invalidate fact' }, { status: 500 });
  }
}
