'use client';

import { EchoState } from './EchoOrb';

interface StatusIndicatorProps {
  state: EchoState;
  isConnected: boolean;
}

export default function StatusIndicator({ state, isConnected }: StatusIndicatorProps) {
  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-2 h-2 rounded-full bg-gray-500" />
        <span className="text-sm">Disconnected</span>
      </div>
    );
  }

  const getIndicatorColor = () => {
    switch (state) {
      case 'idle': return 'bg-indigo-500';
      case 'listening': return 'bg-green-500';
      case 'thinking': return 'bg-yellow-500';
      case 'speaking': return 'bg-purple-500';
    }
  };

  const getIndicatorAnimation = () => {
    switch (state) {
      case 'idle': return '';
      case 'listening': return 'animate-pulse';
      case 'thinking': return 'animate-ping';
      case 'speaking': return 'animate-pulse';
    }
  };

  const getStatusText = () => {
    switch (state) {
      case 'idle': return 'Connected';
      case 'listening': return 'Listening';
      case 'thinking': return 'Processing';
      case 'speaking': return 'Speaking';
    }
  };

  return (
    <div className="flex items-center gap-2 text-gray-400">
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${getIndicatorColor()}`} />
        <div className={`absolute inset-0 w-2 h-2 rounded-full ${getIndicatorColor()} ${getIndicatorAnimation()}`} />
      </div>
      <span className="text-sm">{getStatusText()}</span>
      {state === 'listening' && (
        <MicrophoneIcon className="w-4 h-4 text-green-500" />
      )}
    </div>
  );
}

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );
}
