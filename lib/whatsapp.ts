// ============================================
// WhatsApp Business API Integration
// Supports: Meta Cloud API & Twilio
// ============================================

export interface IncomingMessage {
  messageId: string;
  from: string;
  timestamp: Date;
  type: 'text' | 'image' | 'audio' | 'button' | 'interactive';
  text?: string;
  buttonPayload?: string;
}

// ============================================
// Meta WhatsApp Cloud API Client
// ============================================

export class MetaWhatsAppClient {
  private accessToken: string;
  private phoneNumberId: string;
  private apiVersion = 'v18.0';
  private baseUrl = 'https://graph.facebook.com';

  constructor(accessToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }

  async sendMessage(to: string, text: string): Promise<{ messageId: string; success: boolean }> {
    const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to.replace(/[^\d]/g, ''),
          type: 'text',
          text: { body: text },
        }),
      });

      const data = await response.json();
      return {
        messageId: data.messages?.[0]?.id || '',
        success: response.ok,
      };
    } catch (error) {
      console.error('WhatsApp send error:', error);
      return { messageId: '', success: false };
    }
  }

  async markAsRead(messageId: string): Promise<boolean> {
    const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  static parseWebhook(body: unknown): IncomingMessage | null {
    try {
      const payload = body as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              messages?: Array<{
                id: string;
                from: string;
                timestamp: string;
                type: string;
                text?: { body: string };
              }>;
            };
          }>;
        }>;
      };

      const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return null;

      return {
        messageId: message.id,
        from: message.from,
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        type: message.type as IncomingMessage['type'],
        text: message.text?.body,
      };
    } catch {
      return null;
    }
  }

  static verifyWebhook(mode: string, token: string, challenge: string, verifyToken: string): string | null {
    return mode === 'subscribe' && token === verifyToken ? challenge : null;
  }
}

// ============================================
// Twilio WhatsApp Client
// ============================================

export class TwilioWhatsAppClient {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    // Ensure whatsapp: prefix
    this.fromNumber = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
  }

  async sendMessage(to: string, text: string): Promise<{ messageId: string; success: boolean }> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    // Ensure whatsapp: prefix on recipient
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to.replace(/[^\d+]/g, '')}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: this.fromNumber,
          To: toNumber,
          Body: text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Twilio error:', data);
        return { messageId: '', success: false };
      }

      return {
        messageId: data.sid || '',
        success: true,
      };
    } catch (error) {
      console.error('Twilio send error:', error);
      return { messageId: '', success: false };
    }
  }

  async markAsRead(_messageId: string): Promise<boolean> {
    // Twilio doesn't have read receipts API
    return true;
  }

  // Parse Twilio webhook (form data)
  static parseWebhook(body: Record<string, string>): IncomingMessage | null {
    try {
      if (!body.From || !body.Body) return null;

      return {
        messageId: body.MessageSid || crypto.randomUUID(),
        from: body.From.replace('whatsapp:', ''),
        timestamp: new Date(),
        type: 'text',
        text: body.Body,
      };
    } catch {
      return null;
    }
  }
}

// ============================================
// Unified WhatsApp Service
// ============================================

export type WhatsAppProvider = 'meta' | 'twilio';

export interface WhatsAppService {
  sendMessage(to: string, text: string): Promise<{ messageId: string; success: boolean }>;
  markAsRead(messageId: string): Promise<boolean>;
}

export function createWhatsAppClient(): WhatsAppService {
  const provider = (process.env.WHATSAPP_PROVIDER || 'meta') as WhatsAppProvider;

  if (provider === 'twilio') {
    return new TwilioWhatsAppClient(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
      process.env.TWILIO_WHATSAPP_NUMBER!
    );
  }

  // Default to Meta
  return new MetaWhatsAppClient(
    process.env.WHATSAPP_ACCESS_TOKEN!,
    process.env.WHATSAPP_PHONE_NUMBER_ID!
  );
}

// Parse incoming message based on provider
export function parseIncomingMessage(body: unknown, contentType: string): IncomingMessage | null {
  // Twilio sends form-urlencoded
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return TwilioWhatsAppClient.parseWebhook(body as Record<string, string>);
  }
  // Meta sends JSON
  return MetaWhatsAppClient.parseWebhook(body);
}

// ============================================
// Quick Response Buttons
// ============================================

export const QUICK_RESPONSES = {
  FEELING_GOOD: { id: 'feeling_good', title: "Doing well" },
  NEED_HELP: { id: 'need_help', title: 'Need to talk' },
  QUESTION: { id: 'question', title: 'Have a question' },
  SYMPTOMS: { id: 'symptoms', title: 'New symptoms' },
};

export function getQuickButtons(): Array<{ id: string; title: string }> {
  return Object.values(QUICK_RESPONSES);
}
