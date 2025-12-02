import { NextResponse } from 'next/server';
import {
  createSpeakerProfile,
  getAllSpeakerProfiles,
  getSpeakerProfile,
  updateSpeakerProfile,
  deleteSpeakerProfile,
  initDatabase,
} from '@/lib/db';

// GET - List all speaker profiles
export async function GET() {
  try {
    await initDatabase();
    const speakers = await getAllSpeakerProfiles();

    // Don't send voiceprints to client (they're large and sensitive)
    const sanitizedSpeakers = speakers.map(s => ({
      id: s.id,
      name: s.name,
      enrolled_at: s.enrolled_at,
      last_seen: s.last_seen,
      total_conversations: s.total_conversations,
      total_minutes: s.total_minutes,
      relationship_notes: s.relationship_notes,
    }));

    return NextResponse.json({ speakers: sanitizedSpeakers });
  } catch (error) {
    console.error('Error fetching speakers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch speakers' },
      { status: 500 }
    );
  }
}

// POST - Create a new speaker profile (enrollment)
export async function POST(request: Request) {
  try {
    await initDatabase();
    const { name, voiceprint } = await request.json();

    if (!name || !voiceprint) {
      return NextResponse.json(
        { error: 'Name and voiceprint are required' },
        { status: 400 }
      );
    }

    const id = await createSpeakerProfile(name, voiceprint);
    const profile = await getSpeakerProfile(id);

    return NextResponse.json({
      success: true,
      speaker: {
        id: profile?.id,
        name: profile?.name,
        enrolled_at: profile?.enrolled_at,
      },
    });
  } catch (error) {
    console.error('Error creating speaker:', error);
    return NextResponse.json(
      { error: 'Failed to create speaker profile' },
      { status: 500 }
    );
  }
}

// PUT - Update a speaker profile
export async function PUT(request: Request) {
  try {
    const { id, name, relationship_notes, preferences } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Speaker ID is required' },
        { status: 400 }
      );
    }

    await updateSpeakerProfile(id, { name, relationship_notes, preferences });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating speaker:', error);
    return NextResponse.json(
      { error: 'Failed to update speaker profile' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a speaker profile
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Speaker ID is required' },
        { status: 400 }
      );
    }

    await deleteSpeakerProfile(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting speaker:', error);
    return NextResponse.json(
      { error: 'Failed to delete speaker profile' },
      { status: 500 }
    );
  }
}
