'use client';

import React, { useRef, useEffect } from 'react';
import Panel from './Panel';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState } from '@/types/dashboard';

interface VoicePanelProps {
  panel: PanelState;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  isConnected: boolean;
  onStartConversation: () => void;
  onEndConversation: () => void;
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export default function VoicePanel({
  panel,
  messages,
  isConnected,
  onStartConversation,
  onEndConversation,
  voiceState,
}: VoicePanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getStateLabel = () => {
    switch (voiceState) {
      case 'listening':
        return 'Listening...';
      case 'thinking':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking...';
      default:
        return 'Idle';
    }
  };

  const getStateColor = () => {
    switch (voiceState) {
      case 'listening':
        return 'text-green-400';
      case 'thinking':
        return 'text-yellow-400';
      case 'speaking':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <Panel
      panel={panel}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      }
      statusIndicator={
        isConnected
          ? voiceState === 'listening' || voiceState === 'speaking'
            ? 'active'
            : 'loading'
          : null
      }
    >
      <div className="flex flex-col h-full">
        {/* Status bar */}
        <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? voiceState === 'listening'
                    ? 'bg-green-400 animate-pulse'
                    : voiceState === 'speaking'
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-yellow-400'
                  : 'bg-gray-500'
              }`}
            />
            <span className={`text-sm ${getStateColor()}`}>
              {isConnected ? getStateLabel() : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={isConnected ? onEndConversation : onStartConversation}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              isConnected
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        {/* Voice visualization */}
        {isConnected && (
          <div className="px-3 py-3 border-b border-gray-700 flex items-center justify-center">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    voiceState === 'listening'
                      ? 'bg-green-400'
                      : voiceState === 'speaking'
                      ? 'bg-blue-400'
                      : 'bg-gray-600'
                  }`}
                  style={{
                    height:
                      voiceState === 'listening' || voiceState === 'speaking'
                        ? `${12 + Math.random() * 20}px`
                        : '8px',
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              <p className="text-sm">
                {isConnected
                  ? 'Start speaking...'
                  : 'Click Connect to start a conversation'}
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    msg.role === 'user'
                      ? 'bg-blue-500/20 text-blue-100'
                      : 'bg-gray-800 text-gray-200'
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions hint */}
        {isConnected && (
          <div className="px-3 py-2 border-t border-gray-700 text-xs text-gray-500">
            <p>Try: "Research AI agents" or "Check my email"</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
