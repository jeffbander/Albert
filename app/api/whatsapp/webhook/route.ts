import { NextRequest, NextResponse } from 'next/server';
import { MetaWhatsAppClient, createWhatsAppService } from '@/lib/whatsapp';
import {
  initPatientDatabase,
  getPatientByPhone,
  createPatientConversation,
  endPatientConversation,
  logWhatsAppMessage,
} from '@/lib/patient-db';
import {
  generatePatientResponse,
  handleQuickAction,
  reflectOnConversation,
} from '@/lib/patient-ai';

// In-memory conversation session tracking
// In production, use Redis or similar
const activeSessions: Map<string, {
  conversationId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastActivity: number;
}> = new Map();

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT = 30 * 60 * 1000;

// ============================================
// GET: Webhook Verification (Meta)
// ============================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN;

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
// POST: Handle Incoming Messages
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Initialize database on first request
    await initPatientDatabase();

    // Determine if this is Twilio or Meta based on content-type or structure
    const contentType = request.headers.get('content-type') || '';
    const isTwilio = contentType.includes('application/x-www-form-urlencoded');

    let body: unknown;
    if (isTwilio) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      body = await request.json();
    }

    // Create WhatsApp service
    const whatsapp = createWhatsAppService();

    // Parse incoming message
    const incomingMessage = whatsapp.parseIncomingMessage(body, isTwilio);

    if (!incomingMessage) {
      // This might be a status update or other notification
      return NextResponse.json({ status: 'ok' });
    }

    console.log('Received WhatsApp message:', {
      from: incomingMessage.from,
      type: incomingMessage.type,
      text: incomingMessage.text?.slice(0, 50),
    });

    // Look up patient by phone number
    const patient = await getPatientByPhone(incomingMessage.from);

    if (!patient) {
      // Unknown number - could implement registration flow here
      console.log('Unknown phone number:', incomingMessage.from);
      await whatsapp.sendMessage(
        incomingMessage.from,
        "Hi! I don't recognize your number. If you're a patient of our practice, please contact us to set up your AI companion."
      );
      return NextResponse.json({ status: 'unknown_patient' });
    }

    if (!patient.is_active) {
      await whatsapp.sendMessage(
        incomingMessage.from,
        "Your account is currently inactive. Please contact your care team for assistance."
      );
      return NextResponse.json({ status: 'inactive_patient' });
    }

    // Get or create conversation session
    let session = activeSessions.get(patient.id);
    const now = Date.now();

    if (!session || (now - session.lastActivity) > SESSION_TIMEOUT) {
      // Start new conversation
      const conversationId = await createPatientConversation(patient.id, 'whatsapp');
      session = {
        conversationId,
        messages: [],
        lastActivity: now,
      };
      activeSessions.set(patient.id, session);

      // End previous session if it exists
      if (session.messages.length > 0) {
        // Trigger reflection on previous conversation (async)
        reflectOnConversation(patient.id, session.conversationId, session.messages).catch(console.error);
      }
    } else {
      session.lastActivity = now;
    }

    // Log incoming message
    await logWhatsAppMessage(
      patient.id,
      session.conversationId,
      'inbound',
      incomingMessage.text || `[${incomingMessage.type}]`,
      incomingMessage.messageId
    );

    // Handle the message
    let responseText: string;

    // Check if this is a button/quick action response
    if (incomingMessage.type === 'button' || incomingMessage.type === 'interactive') {
      responseText = await handleQuickAction(patient.id, incomingMessage.buttonPayload || '');
    } else if (incomingMessage.text) {
      // Generate AI response
      const aiResponse = await generatePatientResponse(
        patient.id,
        session.conversationId,
        incomingMessage.text
      );
      responseText = aiResponse.message;

      // Track messages for reflection
      session.messages.push({ role: 'user', content: incomingMessage.text });
      session.messages.push({ role: 'assistant', content: responseText });

      // Log alert creation
      if (aiResponse.shouldAlert) {
        console.log(`Alert created for patient ${patient.id}:`, {
          type: aiResponse.alertType,
          severity: aiResponse.alertSeverity,
          reason: aiResponse.alertReason,
        });
      }
    } else {
      // Non-text message (image, audio, etc.)
      responseText = "I received your message but I can only read text right now. Could you type out what you wanted to share?";
    }

    // Send response
    const sendResult = await whatsapp.sendMessage(patient.phone_number, responseText);

    // Log outgoing message
    await logWhatsAppMessage(
      patient.id,
      session.conversationId,
      'outbound',
      responseText,
      sendResult.messageId
    );

    return NextResponse.json({
      status: 'ok',
      messageId: sendResult.messageId,
    });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// Cleanup: End stale sessions periodically
// ============================================

// This would be better as a cron job in production
setInterval(() => {
  const now = Date.now();
  for (const [patientId, session] of activeSessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      // End the conversation
      endPatientConversation(session.conversationId).catch(console.error);

      // Trigger reflection
      if (session.messages.length > 0) {
        reflectOnConversation(patientId, session.conversationId, session.messages).catch(console.error);
      }

      activeSessions.delete(patientId);
    }
  }
}, 60000); // Check every minute
