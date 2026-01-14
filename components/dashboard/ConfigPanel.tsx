'use client';

import React, { useState, useEffect } from 'react';
import Panel from './Panel';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState, ServiceStatus } from '@/types/dashboard';

interface ConfigPanelProps {
  panel: PanelState;
}

interface ServiceConfig {
  name: string;
  description: string;
  status: ServiceStatus['status'];
  message?: string;
  configUrl?: string;
  envVars?: string[];
  setupInstructions?: string[];
}

export default function ConfigPanel({ panel }: ConfigPanelProps) {
  const { state, updateServiceStatus } = useDashboard();
  const [isChecking, setIsChecking] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  // Build service configs from state
  const services: ServiceConfig[] = [
    {
      name: 'Voice',
      description: 'OpenAI Realtime Voice API for conversations',
      status: state.services.find(s => s.name === 'Voice')?.status || 'disconnected',
      message: state.services.find(s => s.name === 'Voice')?.message,
      envVars: ['OPENAI_API_KEY'],
      setupInstructions: [
        '1. Get an API key from platform.openai.com',
        '2. Add OPENAI_API_KEY to your .env file',
        '3. Restart the application',
      ],
    },
    {
      name: 'Gmail',
      description: 'Send and receive emails through Gmail',
      status: state.services.find(s => s.name === 'Gmail')?.status || 'disconnected',
      message: state.services.find(s => s.name === 'Gmail')?.message,
      configUrl: '/api/auth/signin?callbackUrl=/dashboard',
      envVars: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_ENABLED'],
      setupInstructions: [
        '1. Create OAuth credentials in Google Cloud Console',
        '2. Enable Gmail API in your project',
        '3. Add client credentials to .env',
        '4. Set GMAIL_ENABLED=true',
        '5. Click "Connect" below to authenticate',
      ],
    },
    {
      name: 'Browser',
      description: 'Web browsing and automation capabilities',
      status: state.services.find(s => s.name === 'Browser')?.status || 'disconnected',
      message: state.services.find(s => s.name === 'Browser')?.message,
      envVars: ['BROWSER_PROVIDER', 'CHROME_DEBUG_PORT', 'BROWSERBASE_API_KEY'],
      setupInstructions: [
        'For local development:',
        '1. Set BROWSER_PROVIDER=local-cdp',
        '2. Launch Chrome with: chrome --remote-debugging-port=9222',
        '',
        'For production (Browserbase):',
        '1. Sign up at browserbase.com',
        '2. Set BROWSER_PROVIDER=browserbase',
        '3. Add BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID',
      ],
    },
    {
      name: 'Database',
      description: 'Turso/LibSQL for persistent storage',
      status: state.services.find(s => s.name === 'Database')?.status || 'disconnected',
      message: state.services.find(s => s.name === 'Database')?.message,
      envVars: ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
      setupInstructions: [
        '1. Create a database at turso.tech',
        '2. Copy your database URL and auth token',
        '3. Add to your .env file',
        '4. Run: npm run db:push',
      ],
    },
    {
      name: 'Perplexity',
      description: 'AI-powered research and web search',
      status: state.services.find(s => s.name === 'Perplexity')?.status || 'disconnected',
      message: state.services.find(s => s.name === 'Perplexity')?.message,
      envVars: ['PERPLEXITY_API_KEY'],
      setupInstructions: [
        '1. Get an API key from perplexity.ai',
        '2. Add PERPLEXITY_API_KEY to .env',
      ],
    },
  ];

  // Check all service statuses
  const checkServices = async () => {
    setIsChecking(true);

    // Check each service
    for (const service of services) {
      try {
        let status: ServiceStatus['status'] = 'disconnected';
        let message = '';

        switch (service.name) {
          case 'Voice': {
            const res = await fetch('/api/realtime/session', { method: 'POST' });
            status = res.ok ? 'connected' : 'error';
            break;
          }
          case 'Gmail': {
            const res = await fetch('/api/gmail', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'status' }),
            });
            const data = await res.json();
            status = data.configured ? 'connected' : 'disconnected';
            message = data.message || '';
            break;
          }
          case 'Browser': {
            const res = await fetch('/api/browser', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'health' }),
            });
            const data = await res.json();
            status = data.available ? 'connected' : 'disconnected';
            message = data.message || '';
            break;
          }
          case 'Database': {
            const res = await fetch('/api/db/init');
            status = res.ok ? 'connected' : 'error';
            break;
          }
          case 'Perplexity': {
            const res = await fetch('/api/research', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'health_check' }),
            });
            status = res.ok ? 'connected' : 'disconnected';
            break;
          }
        }

        updateServiceStatus(service.name, status, message);
      } catch {
        updateServiceStatus(service.name, 'error', 'Check failed');
      }
    }

    setIsChecking(false);
  };

  // Check on mount
  useEffect(() => {
    checkServices();
  }, []);

  const getStatusIcon = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'connected':
        return (
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            Connected
          </span>
        );
      case 'disconnected':
        return (
          <span className="flex items-center gap-1 text-gray-400">
            <span className="w-2 h-2 bg-gray-400 rounded-full" />
            Not configured
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2 h-2 bg-red-400 rounded-full" />
            Error
          </span>
        );
      case 'configuring':
        return (
          <span className="flex items-center gap-1 text-yellow-400">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            Configuring...
          </span>
        );
    }
  };

  const selectedConfig = selectedService
    ? services.find(s => s.name === selectedService)
    : null;

  return (
    <Panel
      panel={panel}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      }
      headerActions={
        <button
          onClick={checkServices}
          disabled={isChecking}
          className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition mr-2"
          title="Check all services"
        >
          <svg className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      }
    >
      <div className="flex flex-col h-full">
        {/* Service list */}
        {!selectedConfig && (
          <div className="p-3 space-y-2">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Services</h3>
            {services.map((service) => (
              <button
                key={service.name}
                onClick={() => setSelectedService(service.name)}
                className="w-full p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-left"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-200">{service.name}</span>
                  <span className="text-xs">{getStatusIcon(service.status)}</span>
                </div>
                <p className="text-xs text-gray-500">{service.description}</p>
                {service.message && (
                  <p className="text-xs text-gray-600 mt-1">{service.message}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Service detail */}
        {selectedConfig && (
          <div className="flex flex-col h-full">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
              <button
                onClick={() => setSelectedService(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-300">{selectedConfig.name}</span>
              <span className="ml-auto text-xs">{getStatusIcon(selectedConfig.status)}</span>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              <p className="text-sm text-gray-400">{selectedConfig.description}</p>

              {/* Environment variables */}
              {selectedConfig.envVars && selectedConfig.envVars.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Required Environment Variables</h4>
                  <div className="space-y-1">
                    {selectedConfig.envVars.map((v) => (
                      <code key={v} className="block text-xs bg-gray-800 px-2 py-1 rounded text-green-400">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Setup instructions */}
              {selectedConfig.setupInstructions && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Setup Instructions</h4>
                  <div className="bg-gray-800 rounded-lg p-3 space-y-1">
                    {selectedConfig.setupInstructions.map((instruction, i) => (
                      <p key={i} className="text-xs text-gray-400">
                        {instruction || '\u00A0'}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Connect button for OAuth services */}
              {selectedConfig.configUrl && selectedConfig.status !== 'connected' && (
                <a
                  href={selectedConfig.configUrl}
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
                >
                  Connect {selectedConfig.name}
                </a>
              )}

              {/* Special browser setup */}
              {selectedConfig.name === 'Browser' && selectedConfig.status !== 'connected' && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-300 mb-2">Quick Start (Local Development)</p>
                  <code className="block text-xs bg-gray-900 px-3 py-2 rounded text-gray-300 overflow-x-auto">
                    # Windows{'\n'}
                    scripts\launch-chrome-debug.bat{'\n'}{'\n'}
                    # macOS{'\n'}
                    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
                  </code>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
