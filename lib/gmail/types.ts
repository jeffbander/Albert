/**
 * Gmail API Type Definitions
 * Types for the direct Gmail API integration (serverless-compatible)
 */

/**
 * OAuth credentials needed to authenticate with Gmail API
 */
export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

/**
 * Email message representation
 */
export interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  snippet: string;
  date: Date;
  labels: string[];
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachment[];
}

/**
 * Email attachment information
 */
export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Draft email representation
 */
export interface Draft {
  id: string;
  message: Partial<Email>;
}

/**
 * Gmail label representation
 */
export interface Label {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelHide' | 'labelShowIfUnread';
  messagesTotal?: number;
  messagesUnread?: number;
}

/**
 * Options for sending an email
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

/**
 * Options for reading emails
 */
export interface ReadEmailsOptions {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

/**
 * Result of a paginated email list
 */
export interface EmailListResult {
  emails: Email[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

/**
 * Options for creating a draft
 */
export interface CreateDraftOptions {
  to: string | string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

/**
 * Label modification options
 */
export interface ModifyLabelsOptions {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/**
 * Gmail API error with additional context
 */
export interface GmailApiError extends Error {
  code?: number;
  status?: string;
  errors?: Array<{
    domain: string;
    reason: string;
    message: string;
  }>;
}

/**
 * OAuth token stored in database
 */
export interface StoredOAuthToken {
  id: string;
  userId: string;
  provider: 'gmail';
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result of OAuth token refresh
 */
export interface TokenRefreshResult {
  accessToken: string;
  expiresAt: Date;
  refreshToken?: string;
}

/**
 * Gmail profile information
 */
export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

/**
 * Rate limit tracking
 */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}
