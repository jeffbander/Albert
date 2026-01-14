'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Panel from './Panel';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState, EmailPreview } from '@/types/dashboard';

interface EmailPanelProps {
  panel: PanelState;
}

export default function EmailPanel({ panel }: EmailPanelProps) {
  const { updatePanelData, setEmails } = useDashboard();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailPreview | null>(null);
  const [emailBody, setEmailBody] = useState<string | null>(null);

  // Compose form state
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const emails = panel.data?.emails as EmailPreview[] || [];
  const isConfigured = panel.data?.isConfigured as boolean;

  // Fetch emails on mount
  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', maxResults: '20' }),
      });

      const data = await response.json();
      if (data.success && data.emails) {
        const emailPreviews: EmailPreview[] = data.emails.map((e: {
          id: string;
          from: string;
          subject: string;
          snippet: string;
          date: string;
          labelIds?: string[];
        }) => ({
          id: e.id,
          from: e.from || 'Unknown',
          subject: e.subject || '(No subject)',
          snippet: e.snippet || '',
          timestamp: new Date(e.date || Date.now()),
          isRead: !e.labelIds?.includes('UNREAD'),
        }));
        updatePanelData(panel.id, { emails: emailPreviews, isConfigured: true });
        setEmails(emailPreviews);
      } else if (data.error?.includes('not configured') || data.error?.includes('Not authenticated')) {
        updatePanelData(panel.id, { isConfigured: false });
        setError('Gmail is not configured. Click Configure below to set it up.');
      } else {
        setError(data.error || 'Failed to fetch emails');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails');
    } finally {
      setIsLoading(false);
    }
  };

  // Read full email
  const readEmail = async (email: EmailPreview) => {
    setSelectedEmail(email);
    setIsLoading(true);

    try {
      const response = await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_one', messageId: email.id }),
      });

      const data = await response.json();
      if (data.success && data.email) {
        setEmailBody(data.email.body || data.email.snippet || 'No content');
      } else {
        setEmailBody('Failed to load email content');
      }
    } catch (err) {
      setEmailBody('Error loading email');
    } finally {
      setIsLoading(false);
    }
  };

  // Send email
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !subject.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // First compose
      const composeRes = await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compose', to, subject, body }),
      });

      const composeData = await composeRes.json();
      if (!composeData.success) {
        throw new Error(composeData.error || 'Failed to compose email');
      }

      // Then confirm send
      const sendRes = await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_send', pendingId: composeData.pendingId }),
      });

      const sendData = await sendRes.json();
      if (sendData.success) {
        setTo('');
        setSubject('');
        setBody('');
        setComposeMode(false);
        fetchEmails(); // Refresh
      } else {
        throw new Error(sendData.error || 'Failed to send email');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsLoading(false);
    }
  };

  // Back to list
  const handleBack = () => {
    setSelectedEmail(null);
    setEmailBody(null);
    setComposeMode(false);
  };

  return (
    <Panel
      panel={panel}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      }
      statusIndicator={isLoading ? 'loading' : isConfigured ? 'success' : 'error'}
      headerActions={
        <div className="flex items-center gap-1 mr-2">
          <button
            onClick={fetchEmails}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setComposeMode(true)}
            className="p-1 text-gray-400 hover:text-green-400 hover:bg-gray-700 rounded transition"
            title="Compose"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {error && (
          <div className="p-3 m-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!isConfigured && !isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-6">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-300 mb-2">Gmail Not Configured</h3>
              <p className="text-sm text-gray-500 mb-4">
                Connect your Gmail account to read and send emails.
              </p>
              <a
                href="/api/auth/signin?callbackUrl=/dashboard"
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
              >
                Configure Gmail
              </a>
            </div>
          </div>
        )}

        {/* Compose mode */}
        {composeMode && (
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
              <button onClick={handleBack} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-300">New Email</span>
            </div>
            <form onSubmit={handleSendEmail} className="flex-1 flex flex-col p-3 gap-3">
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="To"
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                required
              />
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                required
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message"
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                rows={6}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-sm font-medium transition"
              >
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        )}

        {/* Email detail view */}
        {selectedEmail && !composeMode && (
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
              <button onClick={handleBack} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-300 truncate">{selectedEmail.subject}</span>
            </div>
            <div className="p-3 border-b border-gray-700">
              <p className="text-sm text-white font-medium">{selectedEmail.from}</p>
              <p className="text-xs text-gray-500">
                {new Date(selectedEmail.timestamp).toLocaleString()}
              </p>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : (
                <div className="text-sm text-gray-300 whitespace-pre-wrap">{emailBody}</div>
              )}
            </div>
          </div>
        )}

        {/* Email list */}
        {!selectedEmail && !composeMode && isConfigured && (
          <div className="flex-1 overflow-auto">
            {emails.length === 0 && !isLoading && (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p className="text-sm">No emails found</p>
              </div>
            )}
            <div className="divide-y divide-gray-700">
              {emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => readEmail(email)}
                  className={`w-full text-left p-3 hover:bg-gray-800/50 transition ${
                    !email.isRead ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {!email.isRead && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                    <span className={`text-sm truncate ${!email.isRead ? 'font-medium text-white' : 'text-gray-300'}`}>
                      {email.from}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                      {new Date(email.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className={`text-sm truncate ${!email.isRead ? 'text-gray-200' : 'text-gray-400'}`}>
                    {email.subject}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-1">{email.snippet}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
