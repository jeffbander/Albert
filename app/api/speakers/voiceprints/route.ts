import { NextResponse } from 'next/server';
import { getAllSpeakerProfiles, initDatabase } from '@/lib/db';

// Force dynamic rendering for API routes with database access
export const dynamic = 'force-dynamic';

// GET - Get all voiceprints for identification
// This returns the full voiceprint data needed for Eagle identification
export async function GET() {
  try {
    await initDatabase();
    const speakers = await getAllSpeakerProfiles();

    // Return voiceprints with speaker info for identification
    const voiceprints = speakers.map(s => ({
      id: s.id,
      name: s.name,
      voiceprint: s.voiceprint,
    }));

    return NextResponse.json({ voiceprints });
  } catch (error) {
    console.error('Error fetching voiceprints:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voiceprints' },
      { status: 500 }
    );
  }
}
