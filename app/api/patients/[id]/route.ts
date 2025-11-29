import { NextRequest, NextResponse } from 'next/server';
import {
  getPatient,
  updatePatient,
  getPatientAIModel,
  updatePatientAIModel,
  getPatientConversations,
  getPatientMemories,
  getPatientFamily,
  addFamilyMember,
} from '@/lib/patient-db';

// ============================================
// GET: Get patient details
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const includeDetails = searchParams.get('details') === 'true';

    const patient = await getPatient(id);

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    const response: Record<string, unknown> = { patient };

    if (includeDetails) {
      const [aiModel, conversations, memories, family] = await Promise.all([
        getPatientAIModel(id),
        getPatientConversations(id, 10),
        getPatientMemories(id, { limit: 20 }),
        getPatientFamily(id),
      ]);

      response.ai_model = aiModel;
      response.recent_conversations = conversations;
      response.recent_memories = memories;
      response.family = family;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting patient:', error);
    return NextResponse.json(
      { error: 'Failed to get patient' },
      { status: 500 }
    );
  }
}

// ============================================
// PUT: Update patient
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const patient = await getPatient(id);
    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Update patient fields
    const patientUpdates: Record<string, unknown> = {};
    const allowedPatientFields = ['first_name', 'last_name', 'phone_number', 'email', 'date_of_birth', 'medical_context', 'ai_personality_preset', 'is_active'];

    for (const field of allowedPatientFields) {
      if (body[field] !== undefined) {
        patientUpdates[field] = body[field];
      }
    }

    if (Object.keys(patientUpdates).length > 0) {
      await updatePatient(id, patientUpdates);
    }

    // Update AI model if provided
    if (body.ai_model) {
      const aiModelUpdates: Record<string, unknown> = {};
      const allowedAIFields = [
        'personality_warmth',
        'personality_directness',
        'personality_medical_detail',
        'personality_encouragement',
        'personality_check_in_frequency',
        'communication_preferences',
        'topics_to_avoid',
        'topics_to_encourage',
        'conditions',
        'medications',
        'care_team_notes',
      ];

      for (const field of allowedAIFields) {
        if (body.ai_model[field] !== undefined) {
          aiModelUpdates[field] = body.ai_model[field];
        }
      }

      if (Object.keys(aiModelUpdates).length > 0) {
        await updatePatientAIModel(id, aiModelUpdates);
      }
    }

    // Add family member if provided
    if (body.add_family_member) {
      const fm = body.add_family_member;
      if (fm.name && fm.relationship && fm.phone_number) {
        await addFamilyMember({
          patient_id: id,
          name: fm.name,
          relationship: fm.relationship,
          phone_number: fm.phone_number,
          can_receive_updates: fm.can_receive_updates || false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Patient updated successfully',
    });
  } catch (error) {
    console.error('Error updating patient:', error);
    return NextResponse.json(
      { error: 'Failed to update patient' },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE: Deactivate patient (soft delete)
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const patient = await getPatient(id);
    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Soft delete - just mark as inactive
    await updatePatient(id, { is_active: false });

    return NextResponse.json({
      success: true,
      message: 'Patient deactivated successfully',
    });
  } catch (error) {
    console.error('Error deactivating patient:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate patient' },
      { status: 500 }
    );
  }
}
