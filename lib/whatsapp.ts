// ============================================
// WhatsApp Business API Integration
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

export class WhatsAppClient {
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

  async sendButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<{ messageId: string; success: boolean }> {
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
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
              buttons: buttons.slice(0, 3).map(b => ({
                type: 'reply',
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        }),
      });

      const data = await response.json();
      return {
        messageId: data.messages?.[0]?.id || '',
        success: response.ok,
      };
    } catch (error) {
      console.error('WhatsApp buttons error:', error);
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

  // Parse webhook payload
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
                button?: { payload: string; text: string };
                interactive?: { button_reply?: { id: string; title: string } };
              }>;
            };
          }>;
        }>;
      };

      const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return null;

      const parsed: IncomingMessage = {
        messageId: message.id,
        from: message.from,
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        type: message.type as IncomingMessage['type'],
      };

      if (message.text) parsed.text = message.text.body;
      if (message.button) {
        parsed.type = 'button';
        parsed.buttonPayload = message.button.payload;
        parsed.text = message.button.text;
      }
      if (message.interactive?.button_reply) {
        parsed.type = 'interactive';
        parsed.buttonPayload = message.interactive.button_reply.id;
        parsed.text = message.interactive.button_reply.title;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  static verifyWebhook(mode: string, token: string, challenge: string, verifyToken: string): string | null {
    return mode === 'subscribe' && token === verifyToken ? challenge : null;
  }
}

// ============================================
// Create WhatsApp Client from Environment
// ============================================

export function createWhatsAppClient(): WhatsAppClient {
  return new WhatsAppClient(
    process.env.WHATSAPP_ACCESS_TOKEN!,
    process.env.WHATSAPP_PHONE_NUMBER_ID!
  );
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
