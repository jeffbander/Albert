import { NextRequest, NextResponse } from 'next/server';
import {
  initPatientDatabase,
  getUnacknowledgedAlerts,
  acknowledgeAlert,
  getPatient,
} from '@/lib/patient-db';

// ============================================
// GET: Get all unacknowledged alerts
// ============================================

export async function GET(request: NextRequest) {
  try {
    await initPatientDatabase();

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patient_id') || undefined;

    const alerts = await getUnacknowledgedAlerts(patientId);

    // Enrich alerts with patient names
    const enrichedAlerts = await Promise.all(
      alerts.map(async (alert) => {
        const patient = await getPatient(alert.patient_id);
        return {
          ...alert,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown',
          patient_phone: patient?.phone_number,
        };
      })
    );

    return NextResponse.json({
      alerts: enrichedAlerts,
      count: enrichedAlerts.length,
      urgent_count: enrichedAlerts.filter(a => a.severity === 'urgent').length,
      high_count: enrichedAlerts.filter(a => a.severity === 'high').length,
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    return NextResponse.json(
      { error: 'Failed to get alerts' },
      { status: 500 }
    );
  }
}

// ============================================
// POST: Acknowledge an alert
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.alert_id) {
      return NextResponse.json(
        { error: 'Missing alert_id' },
        { status: 400 }
      );
    }

    const acknowledgedBy = body.acknowledged_by || 'care_team';

    await acknowledgeAlert(body.alert_id, acknowledgedBy);

    return NextResponse.json({
      success: true,
      message: 'Alert acknowledged',
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return NextResponse.json(
      { error: 'Failed to acknowledge alert' },
      { status: 500 }
    );
  }
}
