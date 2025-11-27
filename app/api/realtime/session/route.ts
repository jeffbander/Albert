import { NextResponse } from 'next/server';
import { createEphemeralToken } from '@/lib/openai';

export async function POST() {
  try {
    const token = await createEphemeralToken();
    return NextResponse.json(token);
  } catch (error) {
    console.error('Error creating ephemeral token:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
