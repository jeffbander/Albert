import { NextRequest, NextResponse } from 'next/server';
import { MetaWhatsAppClient, TwilioWhatsAppClient, createWhatsAppClient } from '@/lib/whatsapp';
import { initDatabase, getPatientByPhone, createConversation, endConversation, logMessage } from '@/lib/db';
import { generateMedicalResponse, analyzeConversation } from '@/lib/medical-ai';

// Session tracking (use Redis in production)
const sessions: Map<string, {
  conversationId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastActivity: number;
}> = new Map();

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// ============================================
// GET: Webhook verification (Meta only)
// ============================================
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode && token && challenge && verifyToken) {
    const result = MetaWhatsAppClient.verifyWebhook(mode, token, challenge, verifyToken);
    if (result) {
      console.log('WhatsApp webhook verified');
      return new NextResponse(result, { status: 200 });
    }
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// ============================================
// POST: Handle incoming messages (Meta & Twilio)
// ============================================
export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const contentType = request.headers.get('content-type') || '';
    const provider = process.env.WHATSAPP_PROVIDER || 'meta';
    const isTwilio = contentType.includes('application/x-www-form-urlencoded') || provider === 'twilio';

    // Parse body based on provider/content type
    let message;

    if (isTwilio) {
      // Twilio sends form data
      const formData = await request.formData();
      const formObject: Record<string, string> = {};
      formData.forEach((value, key) => {
        formObject[key] = value.toString();
      });
      message = TwilioWhatsAppClient.parseWebhook(formObject);
    } else {
      // Meta sends JSON
      const body = await request.json();
      message = MetaWhatsAppClient.parseWebhook(body);
    }

    // Return empty response if no message (status update, etc.)
    if (!message) {
      if (isTwilio) {
        return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      return NextResponse.json({ status: 'ok' });
    }

    console.log('Received message:', { from: message.from, text: message.text?.slice(0, 50), provider: isTwilio ? 'twilio' : 'meta' });

    // Look up patient
    const patient = await getPatientByPhone(message.from);
    const whatsapp = createWhatsAppClient();

    if (!patient) {
      await whatsapp.sendMessage(
        message.from,
        "Hi! I don't recognize your number. If you're a patient of our practice, please contact us to get set up with your AI health companion."
      );

      if (isTwilio) {
        return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      return NextResponse.json({ status: 'unknown_patient' });
    }

    if (!patient.is_active) {
      if (isTwilio) {
        return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      return NextResponse.json({ status: 'inactive_patient' });
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

    // Generate AI response
    let responseText: string;

    if (message.text) {
      const response = await generateMedicalResponse(patient.id, session.conversationId, message.text);
      responseText = response.message;

      // Track messages for session
      session.messages.push({ role: 'user', content: message.text });
      session.messages.push({ role: 'assistant', content: responseText });

      // Log if alert created
      if (response.shouldAlert) {
        console.log(`⚠️ Alert created for ${patient.first_name}:`, response.alertDetails);
      }
    } else {
      responseText = "I can only read text messages right now. Could you type out what you wanted to share?";
    }

    // Send response via WhatsApp
    const result = await whatsapp.sendMessage(patient.phone_number, responseText);

    // Log outgoing message
    await logMessage(patient.id, session.conversationId, 'outbound', responseText, result.messageId);

    // Mark as read (Meta only)
    if (!isTwilio) {
      await whatsapp.markAsRead(message.messageId);
    }

    // Return appropriate response format
    if (isTwilio) {
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    return NextResponse.json({ status: 'ok', messageId: result.messageId });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Cleanup stale sessions periodically
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
