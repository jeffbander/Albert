/**
 * Gmail API Client
 * Direct Gmail API integration for serverless environments
 * No child processes, no file system dependencies
 */

import { google, gmail_v1 } from 'googleapis';
import type {
  GmailCredentials,
  Email,
  Draft,
  Label,
  SendEmailOptions,
  ReadEmailsOptions,
  EmailListResult,
  CreateDraftOptions,
  ModifyLabelsOptions,
  GmailProfile,
  TokenRefreshResult,
} from './types';

// Rate limiting configuration
const RATE_LIMIT_DELAY_MS = 100; // Minimum delay between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class GmailClient {
  private gmail: gmail_v1.Gmail;
  private oauth2Client: InstanceType<typeof google.auth.OAuth2>;
  private credentials: GmailCredentials;
  private lastRequestTime: number = 0;
  private onTokenRefresh?: (tokens: TokenRefreshResult) => Promise<void>;

  constructor(
    credentials: GmailCredentials,
    options?: {
      onTokenRefresh?: (tokens: TokenRefreshResult) => Promise<void>;
    }
  ) {
    this.credentials = credentials;
    this.onTokenRefresh = options?.onTokenRefresh;

    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/auth/gmail/callback'
    );

    // Set credentials
    this.oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiresAt,
    });

    // Handle token refresh
    this.oauth2Client.on('tokens', async (tokens) => {
      console.log('[GmailClient] Token refreshed');
      if (this.onTokenRefresh && tokens.access_token) {
        await this.onTokenRefresh({
          accessToken: tokens.access_token,
          expiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
          refreshToken: tokens.refresh_token || undefined,
        });
      }
    });

    // Initialize Gmail API client
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Rate limiting helper - ensures minimum delay between requests
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, RATE_LIMIT_DELAY_MS - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Retry helper for API calls
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    retries: number = MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await this.rateLimit();
        return await operation();
      } catch (error: unknown) {
        const gmailError = error as { code?: number; message?: string };
        const isRateLimitError = gmailError.code === 429;
        const isServerError = gmailError.code && gmailError.code >= 500;

        if ((isRateLimitError || isServerError) && attempt < retries - 1) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
          console.log(
            `[GmailClient] Retry ${attempt + 1}/${retries} after ${delay}ms: ${gmailError.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Get the user's Gmail profile
   */
  async getProfile(): Promise<GmailProfile> {
    const response = await this.withRetry(() =>
      this.gmail.users.getProfile({ userId: 'me' })
    );

    return {
      emailAddress: response.data.emailAddress || '',
      messagesTotal: response.data.messagesTotal || 0,
      threadsTotal: response.data.threadsTotal || 0,
      historyId: response.data.historyId || '',
    };
  }

  /**
   * Send an email
   */
  async sendEmail(options: SendEmailOptions): Promise<string> {
    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const cc = options.cc
      ? Array.isArray(options.cc)
        ? options.cc.join(', ')
        : options.cc
      : undefined;
    const bcc = options.bcc
      ? Array.isArray(options.bcc)
        ? options.bcc.join(', ')
        : options.bcc
      : undefined;

    // Build RFC 2822 formatted email
    const messageParts = [
      `To: ${to}`,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
    ];

    if (cc) messageParts.splice(1, 0, `Cc: ${cc}`);
    if (bcc) messageParts.splice(1, 0, `Bcc: ${bcc}`);
    if (options.replyTo) messageParts.push(`Reply-To: ${options.replyTo}`);
    if (options.inReplyTo) messageParts.push(`In-Reply-To: ${options.inReplyTo}`);
    if (options.references) messageParts.push(`References: ${options.references}`);

    messageParts.push('', options.body);

    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.withRetry(() =>
      this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: options.threadId,
        },
      })
    );

    console.log(`[GmailClient] Email sent: ${response.data.id}`);
    return response.data.id || '';
  }

  /**
   * Read emails with optional query
   */
  async readEmails(options: ReadEmailsOptions = {}): Promise<EmailListResult> {
    const query = options.query || 'in:inbox';
    const maxResults = options.maxResults || 10;

    // List messages
    const listResponse = await this.withRetry(() =>
      this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        pageToken: options.pageToken,
        labelIds: options.labelIds,
        includeSpamTrash: options.includeSpamTrash,
      })
    );

    const messages = listResponse.data.messages || [];
    const emails: Email[] = [];

    // Fetch full message details for each
    for (const msg of messages) {
      if (msg.id) {
        const email = await this.getEmail(msg.id);
        emails.push(email);
      }
    }

    return {
      emails,
      nextPageToken: listResponse.data.nextPageToken || undefined,
      resultSizeEstimate: listResponse.data.resultSizeEstimate || 0,
    };
  }

  /**
   * Search emails using Gmail query syntax
   */
  async searchEmails(
    query: string,
    maxResults: number = 10
  ): Promise<Email[]> {
    const result = await this.readEmails({ query, maxResults });
    return result.emails;
  }

  /**
   * Get a single email by ID
   */
  async getEmail(messageId: string): Promise<Email> {
    const response = await this.withRetry(() =>
      this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })
    );

    return this.parseMessage(response.data);
  }

  /**
   * Parse Gmail API message into Email type
   */
  private parseMessage(message: gmail_v1.Schema$Message): Email {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string): string => {
      const header = headers.find(
        (h) => h.name?.toLowerCase() === name.toLowerCase()
      );
      return header?.value || '';
    };

    // Extract body
    let body = '';
    let bodyHtml = '';

    const extractBody = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }

      if (part.parts) {
        for (const subPart of part.parts) {
          extractBody(subPart);
        }
      }
    };

    if (message.payload) {
      extractBody(message.payload);
    }

    // If no plain text body, try to extract from snippet
    if (!body && message.snippet) {
      body = message.snippet;
    }

    // Parse recipients
    const parseRecipients = (value: string): string[] => {
      return value
        .split(',')
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
    };

    // Check for attachments
    const attachments: Email['attachments'] = [];
    const findAttachments = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          findAttachments(subPart);
        }
      }
    };
    if (message.payload) {
      findAttachments(message.payload);
    }

    const labels = message.labelIds || [];
    const isRead = !labels.includes('UNREAD');

    return {
      id: message.id || '',
      threadId: message.threadId || '',
      from: getHeader('From'),
      to: parseRecipients(getHeader('To')),
      cc: parseRecipients(getHeader('Cc')).length > 0
        ? parseRecipients(getHeader('Cc'))
        : undefined,
      subject: getHeader('Subject'),
      body,
      bodyHtml: bodyHtml || undefined,
      snippet: message.snippet || '',
      date: new Date(parseInt(message.internalDate || '0')),
      labels,
      isRead,
      hasAttachments: attachments.length > 0,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  /**
   * Create a draft email
   */
  async createDraft(options: CreateDraftOptions): Promise<Draft> {
    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const cc = options.cc
      ? Array.isArray(options.cc)
        ? options.cc.join(', ')
        : options.cc
      : undefined;
    const bcc = options.bcc
      ? Array.isArray(options.bcc)
        ? options.bcc.join(', ')
        : options.bcc
      : undefined;

    // Build message
    const messageParts = [
      `To: ${to}`,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
    ];

    if (cc) messageParts.splice(1, 0, `Cc: ${cc}`);
    if (bcc) messageParts.splice(1, 0, `Bcc: ${bcc}`);

    messageParts.push('', options.body);

    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.withRetry(() =>
      this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: encodedMessage,
          },
        },
      })
    );

    console.log(`[GmailClient] Draft created: ${response.data.id}`);

    return {
      id: response.data.id || '',
      message: {
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        body: options.body,
      },
    };
  }

  /**
   * Get all labels
   */
  async getLabels(): Promise<Label[]> {
    const response = await this.withRetry(() =>
      this.gmail.users.labels.list({ userId: 'me' })
    );

    const labels: Label[] = (response.data.labels || []).map((label) => ({
      id: label.id || '',
      name: label.name || '',
      type: label.type === 'system' ? 'system' : 'user',
      messageListVisibility: label.messageListVisibility as 'show' | 'hide' | undefined,
      labelListVisibility: label.labelListVisibility as
        | 'labelShow'
        | 'labelHide'
        | 'labelShowIfUnread'
        | undefined,
      messagesTotal: label.messagesTotal || undefined,
      messagesUnread: label.messagesUnread || undefined,
    }));

    return labels;
  }

  /**
   * Mark an email as read
   */
  async markAsRead(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, {
      removeLabelIds: ['UNREAD'],
    });
    console.log(`[GmailClient] Marked as read: ${messageId}`);
  }

  /**
   * Mark an email as unread
   */
  async markAsUnread(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, {
      addLabelIds: ['UNREAD'],
    });
    console.log(`[GmailClient] Marked as unread: ${messageId}`);
  }

  /**
   * Archive an email (remove from inbox)
   */
  async archiveEmail(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, {
      removeLabelIds: ['INBOX'],
    });
    console.log(`[GmailClient] Archived: ${messageId}`);
  }

  /**
   * Unarchive an email (move back to inbox)
   */
  async unarchiveEmail(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, {
      addLabelIds: ['INBOX'],
    });
    console.log(`[GmailClient] Unarchived: ${messageId}`);
  }

  /**
   * Star an email
   */
  async starEmail(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, {
      addLabelIds: ['STARRED'],
    });
  }

  /**
   * Unstar an email
   */
  async unstarEmail(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, {
      removeLabelIds: ['STARRED'],
    });
  }

  /**
   * Move email to trash
   */
  async trashEmail(messageId: string): Promise<void> {
    await this.withRetry(() =>
      this.gmail.users.messages.trash({
        userId: 'me',
        id: messageId,
      })
    );
    console.log(`[GmailClient] Trashed: ${messageId}`);
  }

  /**
   * Restore email from trash
   */
  async untrashEmail(messageId: string): Promise<void> {
    await this.withRetry(() =>
      this.gmail.users.messages.untrash({
        userId: 'me',
        id: messageId,
      })
    );
    console.log(`[GmailClient] Untrashed: ${messageId}`);
  }

  /**
   * Permanently delete an email
   */
  async deleteEmail(messageId: string): Promise<void> {
    await this.withRetry(() =>
      this.gmail.users.messages.delete({
        userId: 'me',
        id: messageId,
      })
    );
    console.log(`[GmailClient] Deleted: ${messageId}`);
  }

  /**
   * Modify labels on a message
   */
  async modifyLabels(
    messageId: string,
    options: ModifyLabelsOptions
  ): Promise<void> {
    await this.withRetry(() =>
      this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: options.addLabelIds,
          removeLabelIds: options.removeLabelIds,
        },
      })
    );
  }

  /**
   * Reply to an email
   */
  async replyToEmail(
    messageId: string,
    body: string,
    options?: { replyAll?: boolean }
  ): Promise<string> {
    // Get the original message to extract thread info
    const original = await this.getEmail(messageId);

    // Build reply headers
    const replyTo = original.from;
    const references = `<${messageId}>`;
    const inReplyTo = `<${messageId}>`;

    // Determine recipients for reply-all
    let to = replyTo;
    let cc: string | undefined;

    if (options?.replyAll) {
      // Include original To recipients (except self) and CC
      const profile = await this.getProfile();
      const selfEmail = profile.emailAddress.toLowerCase();

      const additionalRecipients = original.to
        .filter((addr) => !addr.toLowerCase().includes(selfEmail))
        .join(', ');

      if (additionalRecipients) {
        cc = additionalRecipients;
      }

      if (original.cc && original.cc.length > 0) {
        const ccFiltered = original.cc
          .filter((addr) => !addr.toLowerCase().includes(selfEmail))
          .join(', ');
        cc = cc ? `${cc}, ${ccFiltered}` : ccFiltered;
      }
    }

    return this.sendEmail({
      to,
      cc,
      subject: `Re: ${original.subject.replace(/^Re:\s*/i, '')}`,
      body,
      inReplyTo,
      references,
      threadId: original.threadId,
    });
  }

  /**
   * Get thread by ID
   */
  async getThread(threadId: string): Promise<Email[]> {
    const response = await this.withRetry(() =>
      this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      })
    );

    const messages = response.data.messages || [];
    return messages.map((msg) => this.parseMessage(msg));
  }

  /**
   * Generate OAuth authorization URL
   */
  static getAuthUrl(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    state?: string
  ): string {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.labels',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state,
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  static async exchangeCodeForTokens(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string;
  }> {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain tokens from Google');
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
      scope: tokens.scope || '',
    };
  }

  /**
   * Verify if credentials are valid
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.getProfile();
      return true;
    } catch {
      return false;
    }
  }
}

export default GmailClient;
