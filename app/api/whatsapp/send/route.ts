import { NextRequest, NextResponse } from 'next/server';
import { createWhatsAppService } from '@/lib/whatsapp';
import {
  initPatientDatabase,
  getPatient,
  getAllPatients,
  createPatientConversation,
  logWhatsAppMessage,
} from '@/lib/patient-db';
import { generateCheckInMessage, getQuickActionButtons } from '@/lib/patient-ai';

// ============================================
// POST: Send message to patient(s)
// ============================================

export async function POST(request: NextRequest) {
  try {
    await initPatientDatabase();

    const body = await request.json();

    // Action types:
    // 1. send_message: Send custom message to specific patient
    // 2. send_check_in: Send AI-generated check-in to specific patient
    // 3. broadcast: Send message to multiple patients
    // 4. daily_check_ins: Send check-ins to all patients who need them

    const action = body.action || 'send_message';
    const whatsapp = createWhatsAppService();

    switch (action) {
      case 'send_message': {
        // Send custom message to specific patient
        if (!body.patient_id || !body.message) {
          return NextResponse.json(
            { error: 'Missing patient_id or message' },
            { status: 400 }
          );
        }

        const patient = await getPatient(body.patient_id);
        if (!patient || !patient.is_active) {
          return NextResponse.json(
            { error: 'Patient not found or inactive' },
            { status: 404 }
          );
        }

        const conversationId = await createPatientConversation(patient.id, 'whatsapp');
        const result = await whatsapp.sendMessage(patient.phone_number, body.message);

        await logWhatsAppMessage(
          patient.id,
          conversationId,
          'outbound',
          body.message,
          result.messageId
        );

        return NextResponse.json({
          success: result.success,
          message_id: result.messageId,
          patient: `${patient.first_name} ${patient.last_name}`,
        });
      }

      case 'send_check_in': {
        // Send AI-generated check-in to specific patient
        if (!body.patient_id) {
          return NextResponse.json(
            { error: 'Missing patient_id' },
            { status: 400 }
          );
        }

        const patient = await getPatient(body.patient_id);
        if (!patient || !patient.is_active) {
          return NextResponse.json(
            { error: 'Patient not found or inactive' },
            { status: 404 }
          );
        }

        const checkInMessage = await generateCheckInMessage(patient.id);
        if (!checkInMessage) {
          return NextResponse.json({
            success: false,
            message: 'No check-in needed for this patient right now',
          });
        }

        const conversationId = await createPatientConversation(patient.id, 'whatsapp');

        // Send with quick action buttons
        const result = await whatsapp.sendInteractiveButtons(
          patient.phone_number,
          checkInMessage,
          getQuickActionButtons()
        );

        await logWhatsAppMessage(
          patient.id,
          conversationId,
          'outbound',
          checkInMessage,
          result.messageId
        );

        return NextResponse.json({
          success: result.success,
          message_id: result.messageId,
          message_sent: checkInMessage,
          patient: `${patient.first_name} ${patient.last_name}`,
        });
      }

      case 'broadcast': {
        // Send message to multiple patients
        if (!body.message || !body.patient_ids) {
          return NextResponse.json(
            { error: 'Missing message or patient_ids' },
            { status: 400 }
          );
        }

        const results: Array<{ patient_id: string; success: boolean; error?: string }> = [];

        for (const patientId of body.patient_ids) {
          try {
            const patient = await getPatient(patientId);
            if (!patient || !patient.is_active) {
              results.push({ patient_id: patientId, success: false, error: 'Not found or inactive' });
              continue;
            }

            const conversationId = await createPatientConversation(patient.id, 'whatsapp');
            const result = await whatsapp.sendMessage(patient.phone_number, body.message);

            await logWhatsAppMessage(
              patient.id,
              conversationId,
              'outbound',
              body.message,
              result.messageId
            );

            results.push({ patient_id: patientId, success: result.success });
          } catch (error) {
            results.push({ patient_id: patientId, success: false, error: 'Send failed' });
          }
        }

        return NextResponse.json({
          results,
          total: results.length,
          successful: results.filter(r => r.success).length,
        });
      }

      case 'daily_check_ins': {
        // Send check-ins to all patients who need them
        // This should be called by a cron job
        const patients = await getAllPatients(true);
        const results: Array<{ patient_id: string; patient_name: string; sent: boolean; message?: string }> = [];

        for (const patient of patients) {
          try {
            const checkInMessage = await generateCheckInMessage(patient.id);

            if (checkInMessage) {
              const conversationId = await createPatientConversation(patient.id, 'whatsapp');
              const result = await whatsapp.sendInteractiveButtons(
                patient.phone_number,
                checkInMessage,
                getQuickActionButtons()
              );

              await logWhatsAppMessage(
                patient.id,
                conversationId,
                'outbound',
                checkInMessage,
                result.messageId
              );

              results.push({
                patient_id: patient.id,
                patient_name: `${patient.first_name} ${patient.last_name}`,
                sent: result.success,
                message: checkInMessage,
              });
            } else {
              results.push({
                patient_id: patient.id,
                patient_name: `${patient.first_name} ${patient.last_name}`,
                sent: false,
              });
            }
          } catch (error) {
            console.error(`Error sending check-in to ${patient.id}:`, error);
            results.push({
              patient_id: patient.id,
              patient_name: `${patient.first_name} ${patient.last_name}`,
              sent: false,
            });
          }
        }

        return NextResponse.json({
          results,
          total_patients: patients.length,
          check_ins_sent: results.filter(r => r.sent).length,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
