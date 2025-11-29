import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppClient, createWhatsAppClient, getQuickButtons } from '@/lib/whatsapp';
import { initDatabase, getPatientByPhone, createConversation, endConversation, logMessage } from '@/lib/db';
import { generateMedicalResponse, analyzeConversation } from '@/lib/medical-ai';

// Session tracking (use Redis in production)
const sessions: Map<string, {
  conversationId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastActivity: number;
}> = new Map();

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// GET: Webhook verification
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode && token && challenge && verifyToken) {
    const result = WhatsAppClient.verifyWebhook(mode, token, challenge, verifyToken);
    if (result) return new NextResponse(result, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST: Handle incoming messages
export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const body = await request.json();
    const message = WhatsAppClient.parseWebhook(body);

    if (!message) {
      return NextResponse.json({ status: 'ok' });
    }

    console.log('Received message from:', message.from);

    // Look up patient
    const patient = await getPatientByPhone(message.from);

    if (!patient) {
      const whatsapp = createWhatsAppClient();
      await whatsapp.sendMessage(
        message.from,
        "Hi! I don't recognize your number. If you're a patient of our practice, please contact us to get set up with your AI health companion."
      );
      return NextResponse.json({ status: 'unknown' });
    }

    if (!patient.is_active) {
      return NextResponse.json({ status: 'inactive' });
    }

    // Get or create session
    let session = sessions.get(patient.id);
    const now = Date.now();

    if (!session || (now - session.lastActivity) > SESSION_TIMEOUT) {
      // End old session if exists
      if (session && session.messages.length > 0) {
        endConversation(session.conversationId).catch(console.error);
        analyzeConversation(patient.id, session.conversationId, session.messages).catch(console.error);
      }

      // Start new session
      const conversationId = await createConversation(patient.id, 'whatsapp');
      session = { conversationId, messages: [], lastActivity: now };
      sessions.set(patient.id, session);
    } else {
      session.lastActivity = now;
    }

    // Log incoming message
    await logMessage(patient.id, session.conversationId, 'inbound', message.text || `[${message.type}]`, message.messageId);

    // Generate response
    const whatsapp = createWhatsAppClient();
    let responseText: string;

    if (message.text) {
      const response = await generateMedicalResponse(patient.id, session.conversationId, message.text);
      responseText = response.message;

      // Track messages
      session.messages.push({ role: 'user', content: message.text });
      session.messages.push({ role: 'assistant', content: responseText });

      // Log if alert created
      if (response.shouldAlert) {
        console.log(`Alert created for ${patient.first_name}:`, response.alertDetails);
      }
    } else {
      responseText = "I can only read text messages right now. Could you type out what you wanted to share?";
    }

    // Send response
    const result = await whatsapp.sendMessage(patient.phone_number, responseText);

    // Log outgoing message
    await logMessage(patient.id, session.conversationId, 'outbound', responseText, result.messageId);

    // Mark as read
    await whatsapp.markAsRead(message.messageId);

    return NextResponse.json({ status: 'ok', messageId: result.messageId });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Cleanup stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [patientId, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      endConversation(session.conversationId).catch(console.error);
      if (session.messages.length > 0) {
        analyzeConversation(patientId, session.conversationId, session.messages).catch(console.error);
      }
      sessions.delete(patientId);
    }
  }
}, 60000);
