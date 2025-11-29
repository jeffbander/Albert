// ============================================
// WhatsApp Business API Integration
// ============================================
// Supports both:
// 1. Meta WhatsApp Cloud API (official)
// 2. Twilio WhatsApp API (alternative)
// ============================================

export interface WhatsAppConfig {
  provider: 'meta' | 'twilio';
  // Meta WhatsApp Cloud API
  metaAccessToken?: string;
  metaPhoneNumberId?: string;
  metaBusinessAccountId?: string;
  metaWebhookVerifyToken?: string;
  // Twilio
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
}

export interface IncomingMessage {
  messageId: string;
  from: string; // Phone number
  timestamp: Date;
  type: 'text' | 'image' | 'audio' | 'document' | 'location' | 'button' | 'interactive';
  text?: string;
  mediaUrl?: string;
  location?: { latitude: number; longitude: number };
  buttonPayload?: string;
}

export interface OutgoingMessage {
  to: string;
  type: 'text' | 'template' | 'interactive';
  text?: string;
  template?: {
    name: string;
    language: string;
    components?: Array<{
      type: 'header' | 'body' | 'button';
      parameters: Array<{ type: string; text?: string }>;
    }>;
  };
  interactive?: {
    type: 'button' | 'list';
    body: { text: string };
    action: {
      buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
      sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
    };
  };
}

// ============================================
// Meta WhatsApp Cloud API
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

  async sendTextMessage(to: string, text: string): Promise<{ messageId: string; success: boolean }> {
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
          to: to.replace(/[^\d]/g, ''), // Clean phone number
          type: 'text',
          text: { body: text },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('WhatsApp API error:', data);
        return { messageId: '', success: false };
      }

      return {
        messageId: data.messages?.[0]?.id || '',
        success: true,
      };
    } catch (error) {
      console.error('WhatsApp send error:', error);
      return { messageId: '', success: false };
    }
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'en_US',
    components?: OutgoingMessage['template']['components']
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
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: components || [],
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('WhatsApp template error:', data);
        return { messageId: '', success: false };
      }

      return {
        messageId: data.messages?.[0]?.id || '',
        success: true,
      };
    } catch (error) {
      console.error('WhatsApp template send error:', error);
      return { messageId: '', success: false };
    }
  }

  async sendInteractiveButtons(
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

      if (!response.ok) {
        console.error('WhatsApp interactive error:', data);
        return { messageId: '', success: false };
      }

      return {
        messageId: data.messages?.[0]?.id || '',
        success: true,
      };
    } catch (error) {
      console.error('WhatsApp interactive send error:', error);
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
    } catch (error) {
      console.error('WhatsApp mark as read error:', error);
      return false;
    }
  }

  // Parse incoming webhook payload from Meta
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
                image?: { id: string };
                audio?: { id: string };
                document?: { id: string };
                location?: { latitude: number; longitude: number };
                button?: { payload: string; text: string };
                interactive?: { type: string; button_reply?: { id: string; title: string } };
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

      if (message.text) {
        parsed.text = message.text.body;
      }
      if (message.location) {
        parsed.location = message.location;
      }
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
    } catch (error) {
      console.error('Error parsing WhatsApp webhook:', error);
      return null;
    }
  }

  // Verify webhook challenge from Meta
  static verifyWebhook(
    mode: string,
    token: string,
    challenge: string,
    verifyToken: string
  ): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }
}

// ============================================
// Twilio WhatsApp API (Alternative)
// ============================================

export class TwilioWhatsAppClient {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
  }

  async sendTextMessage(to: string, text: string): Promise<{ messageId: string; success: boolean }> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
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
        console.error('Twilio WhatsApp error:', data);
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

  async sendTemplateMessage(
    to: string,
    contentSid: string,
    variables?: Record<string, string>
  ): Promise<{ messageId: string; success: boolean }> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to.replace(/[^\d+]/g, '')}`;

    const params: Record<string, string> = {
      From: this.fromNumber,
      To: toNumber,
      ContentSid: contentSid,
    };

    if (variables) {
      params.ContentVariables = JSON.stringify(variables);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Twilio template error:', data);
        return { messageId: '', success: false };
      }

      return {
        messageId: data.sid || '',
        success: true,
      };
    } catch (error) {
      console.error('Twilio template send error:', error);
      return { messageId: '', success: false };
    }
  }

  // Parse incoming webhook from Twilio
  static parseWebhook(body: Record<string, string>): IncomingMessage | null {
    try {
      if (!body.From || !body.Body) return null;

      return {
        messageId: body.MessageSid || crypto.randomUUID(),
        from: body.From.replace('whatsapp:', ''),
        timestamp: new Date(),
        type: body.MediaContentType0 ? (
          body.MediaContentType0.startsWith('image/') ? 'image' :
          body.MediaContentType0.startsWith('audio/') ? 'audio' : 'document'
        ) : 'text',
        text: body.Body,
        mediaUrl: body.MediaUrl0,
        location: body.Latitude && body.Longitude ? {
          latitude: parseFloat(body.Latitude),
          longitude: parseFloat(body.Longitude),
        } : undefined,
        buttonPayload: body.ButtonPayload,
      };
    } catch (error) {
      console.error('Error parsing Twilio webhook:', error);
      return null;
    }
  }
}

// ============================================
// Unified WhatsApp Service
// ============================================

export class WhatsAppService {
  private metaClient?: MetaWhatsAppClient;
  private twilioClient?: TwilioWhatsAppClient;
  private provider: 'meta' | 'twilio';

  constructor(config: WhatsAppConfig) {
    this.provider = config.provider;

    if (config.provider === 'meta') {
      if (!config.metaAccessToken || !config.metaPhoneNumberId) {
        throw new Error('Meta WhatsApp requires accessToken and phoneNumberId');
      }
      this.metaClient = new MetaWhatsAppClient(config.metaAccessToken, config.metaPhoneNumberId);
    } else if (config.provider === 'twilio') {
      if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
        throw new Error('Twilio WhatsApp requires accountSid, authToken, and phoneNumber');
      }
      this.twilioClient = new TwilioWhatsAppClient(
        config.twilioAccountSid,
        config.twilioAuthToken,
        config.twilioPhoneNumber
      );
    }
  }

  async sendMessage(to: string, text: string): Promise<{ messageId: string; success: boolean }> {
    if (this.provider === 'meta' && this.metaClient) {
      return this.metaClient.sendTextMessage(to, text);
    } else if (this.provider === 'twilio' && this.twilioClient) {
      return this.twilioClient.sendTextMessage(to, text);
    }
    return { messageId: '', success: false };
  }

  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<{ messageId: string; success: boolean }> {
    if (this.provider === 'meta' && this.metaClient) {
      return this.metaClient.sendInteractiveButtons(to, bodyText, buttons);
    }
    // Twilio doesn't support interactive buttons in the same way,
    // so we fall back to text with numbered options
    if (this.provider === 'twilio' && this.twilioClient) {
      const text = bodyText + '\n\n' + buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
      return this.twilioClient.sendTextMessage(to, text);
    }
    return { messageId: '', success: false };
  }

  parseIncomingMessage(body: unknown, isTwilio: boolean = false): IncomingMessage | null {
    if (isTwilio || this.provider === 'twilio') {
      return TwilioWhatsAppClient.parseWebhook(body as Record<string, string>);
    }
    return MetaWhatsAppClient.parseWebhook(body);
  }
}

// ============================================
// Helper: Create WhatsApp service from env
// ============================================

export function createWhatsAppService(): WhatsAppService {
  const provider = process.env.WHATSAPP_PROVIDER as 'meta' | 'twilio' || 'meta';

  return new WhatsAppService({
    provider,
    // Meta
    metaAccessToken: process.env.WHATSAPP_META_ACCESS_TOKEN,
    metaPhoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID,
    metaBusinessAccountId: process.env.WHATSAPP_META_BUSINESS_ACCOUNT_ID,
    metaWebhookVerifyToken: process.env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN,
    // Twilio
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  });
}
