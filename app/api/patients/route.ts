import { NextRequest, NextResponse } from 'next/server';
import {
  initPatientDatabase,
  createPatient,
  getAllPatients,
} from '@/lib/patient-db';

// ============================================
// GET: List all patients
// ============================================

export async function GET(request: NextRequest) {
  try {
    await initPatientDatabase();

    const searchParams = request.nextUrl.searchParams;
    const includeInactive = searchParams.get('include_inactive') === 'true';

    const patients = await getAllPatients(!includeInactive);

    return NextResponse.json({
      patients,
      count: patients.length,
    });
  } catch (error) {
    console.error('Error listing patients:', error);
    return NextResponse.json(
      { error: 'Failed to list patients' },
      { status: 500 }
    );
  }
}

// ============================================
// POST: Create new patient
// ============================================

export async function POST(request: NextRequest) {
  try {
    await initPatientDatabase();

    const body = await request.json();

    // Validate required fields
    const required = ['external_id', 'first_name', 'last_name', 'phone_number'];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    const patientId = await createPatient({
      external_id: body.external_id,
      first_name: body.first_name,
      last_name: body.last_name,
      phone_number: body.phone_number,
      email: body.email,
      date_of_birth: body.date_of_birth,
      medical_context: body.medical_context,
      ai_personality_preset: body.ai_personality_preset,
    });

    return NextResponse.json({
      success: true,
      patient_id: patientId,
      message: `Patient ${body.first_name} ${body.last_name} created successfully`,
    });
  } catch (error) {
    console.error('Error creating patient:', error);

    // Check for unique constraint violation
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT') {
      return NextResponse.json(
        { error: 'A patient with this phone number or external ID already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create patient' },
      { status: 500 }
    );
  }
}
