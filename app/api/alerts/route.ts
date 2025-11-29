import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getUnacknowledgedAlerts, acknowledgeAlert, getPatient } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    const patientId = request.nextUrl.searchParams.get('patient_id') || undefined;
    const alerts = await getUnacknowledgedAlerts(patientId);

    // Enrich with patient names
    const enriched = await Promise.all(
      alerts.map(async (alert) => {
        const patient = await getPatient(alert.patient_id);
        return {
          ...alert,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown',
        };
      })
    );

    return NextResponse.json({
      alerts: enriched,
      count: enriched.length,
      urgent: enriched.filter(a => a.severity === 'urgent').length,
      high: enriched.filter(a => a.severity === 'high').length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.alert_id) {
      return NextResponse.json({ error: 'Missing alert_id' }, { status: 400 });
    }

    await acknowledgeAlert(body.alert_id, body.acknowledged_by || 'care_team');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
