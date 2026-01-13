import { NextRequest, NextResponse } from 'next/server';
import {
  addCategorizedMemory,
  searchByCategory,
  getMemoriesByCategory,
  getCategoryStats,
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
  const category = searchParams.get('category');
  const query = searchParams.get('query');
  const type = searchParams.get('type') || 'list'; // 'list', 'search', 'stats'
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    if (type === 'stats') {
      const stats = await getCategoryStats();
      return NextResponse.json({ stats });
    }

    if (type === 'search' && query && category) {
      if (!isValidCategory(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      const memories = await searchByCategory(query, category, limit);
      return NextResponse.json({ memories });
    }

    if (category) {
      if (!isValidCategory(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      const memories = await getMemoriesByCategory(category, limit);
      return NextResponse.json({ memories });
    }

    return NextResponse.json({ error: 'Category required for list' }, { status: 400 });
  } catch (error) {
    console.error('Error with category memory:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, category, subcategory, confidence, source, related_entities, tags } = body;

    if (!content || !category) {
      return NextResponse.json(
        { error: 'content and category required' },
        { status: 400 }
      );
    }

    if (!isValidCategory(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const result = await addCategorizedMemory(content, category, {
      subcategory,
      confidence,
      source,
      related_entities,
      tags,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error adding categorized memory:', error);
    return NextResponse.json({ error: 'Failed to add memory' }, { status: 500 });
  }
}
