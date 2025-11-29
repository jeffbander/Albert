import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, createPatient, getAllPatients } from '@/lib/db';

export async function GET() {
  try {
    await initDatabase();
    const patients = await getAllPatients();
    return NextResponse.json({ patients, count: patients.length });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to list patients' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();

    // Validate required fields
    const required = ['external_id', 'first_name', 'last_name', 'phone_number'];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `Missing: ${field}` }, { status: 400 });
      }
    }

    const patientId = await createPatient({
      external_id: body.external_id,
      first_name: body.first_name,
      last_name: body.last_name,
      date_of_birth: body.date_of_birth,
      phone_number: body.phone_number,
      email: body.email,
      conditions: body.conditions || [],
      medications: body.medications || [],
      allergies: body.allergies || [],
      surgical_history: body.surgical_history || [],
      family_history: body.family_history || [],
      smoking_status: body.smoking_status,
      alcohol_use: body.alcohol_use,
      exercise_level: body.exercise_level,
      living_situation: body.living_situation,
      primary_doctor: body.primary_doctor || 'Dr. Bander',
      care_team_notes: body.care_team_notes || [],
    });

    return NextResponse.json({
      success: true,
      patient_id: patientId,
      message: `Patient ${body.first_name} ${body.last_name} created`,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to create patient' }, { status: 500 });
  }
}
