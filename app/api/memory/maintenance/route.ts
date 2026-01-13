import { NextRequest, NextResponse } from 'next/server';
import {
  identifyPruneCandidates,
  findSimilarMemories,
  runMemoryMaintenance,
  archiveMemory,
} from '@/lib/mem0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'candidates'; // 'candidates', 'similar'

  try {
    if (type === 'similar') {
      const groups = await findSimilarMemories();
      return NextResponse.json({
        groupCount: groups.length,
        groups: groups.map(g => ({
          primaryId: g.primary.id,
          primaryContent: g.primary.memory.substring(0, 100),
          duplicateCount: g.duplicates.length,
          duplicateIds: g.duplicates.map(d => d.id),
        })),
      });
    }

    // Default: prune candidates
    const candidates = await identifyPruneCandidates();
    return NextResponse.json({
      summary: {
        lowEffectiveness: candidates.lowEffectiveness.length,
        superseded: candidates.superseded.length,
        stale: candidates.stale.length,
        total: candidates.lowEffectiveness.length +
               candidates.superseded.length +
               candidates.stale.length,
      },
      candidates: {
        lowEffectiveness: candidates.lowEffectiveness.map(m => ({
          id: m.id,
          content: m.memory.substring(0, 100),
        })),
        superseded: candidates.superseded.map(m => ({
          id: m.id,
          content: m.memory.substring(0, 100),
        })),
        stale: candidates.stale.map(m => ({
          id: m.id,
          content: m.memory.substring(0, 100),
        })),
      },
    });
  } catch (error) {
    console.error('Error analyzing memories:', error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, dryRun = true, memoryId, reason } = body;

    if (action === 'run_maintenance') {
      const result = await runMemoryMaintenance(dryRun);
      return NextResponse.json({
        dryRun,
        result,
        message: dryRun
          ? 'Dry run completed. Set dryRun: false to execute.'
          : 'Maintenance completed.',
      });
    }

    if (action === 'archive' && memoryId) {
      await archiveMemory(memoryId, reason || 'Manual archive');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action. Use run_maintenance or archive' }, { status: 400 });
  } catch (error) {
    console.error('Error running maintenance:', error);
    return NextResponse.json({ error: 'Failed to run maintenance' }, { status: 500 });
  }
}
