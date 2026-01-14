'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext';
import Panel from '@/components/dashboard/Panel';
import ResearchPanel from '@/components/dashboard/ResearchPanel';
import BrowserPanel from '@/components/dashboard/BrowserPanel';
import EmailPanel from '@/components/dashboard/EmailPanel';
import ConfigPanel from '@/components/dashboard/ConfigPanel';
import TaskQueuePanel from '@/components/dashboard/TaskQueuePanel';
import BuildPanel from '@/components/dashboard/BuildPanel';
import VoicePanel from '@/components/dashboard/VoicePanel';
import MinimizedDock from '@/components/dashboard/MinimizedDock';
import PasscodeGate from '@/components/PasscodeGate';
import EchoOrb, { EchoState } from '@/components/EchoOrb';
import { BUILD_TOOLS } from '@/lib/buildTools';
import { VOICE_PANEL_TRIGGERS } from '@/types/dashboard';
import type { PanelType } from '@/types/dashboard';

function DashboardContent() {
  const {
    state,
    openPanel,
    addTask,
    updateTask,
    completeTask,
    addResearchResult,
    updateBrowserSnapshot,
    setVoiceConnected,
    updateServiceStatus,
    updatePanelData,
  } = useDashboard();

  // Voice state
  const [voiceState, setVoiceState] = useState<EchoState>('idle');
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [voiceMessages, setVoiceMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
  const [voicePanelId, setVoicePanelId] = useState<string | null>(null);

  // Voice refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Panel rendering map
  const renderPanel = (panelState: typeof state.panels[0]) => {
    if (!panelState.isOpen || panelState.isMinimized) return null;

    switch (panelState.type) {
      case 'research':
        return <ResearchPanel key={panelState.id} panel={panelState} />;
      case 'browser':
        return <BrowserPanel key={panelState.id} panel={panelState} />;
      case 'email':
        return <EmailPanel key={panelState.id} panel={panelState} />;
      case 'config':
        return <ConfigPanel key={panelState.id} panel={panelState} />;
      case 'task-queue':
        return <TaskQueuePanel key={panelState.id} panel={panelState} />;
      case 'build':
        return <BuildPanel key={panelState.id} panel={panelState} />;
      case 'voice':
        return (
          <VoicePanel
            key={panelState.id}
            panel={panelState}
            messages={voiceMessages}
            isConnected={isVoiceConnected}
            onStartConversation={startConversation}
            onEndConversation={endConversation}
            voiceState={voiceState}
          />
        );
      default:
        return null;
    }
  };

  // Detect panel triggers from voice
  const detectPanelTrigger = useCallback((text: string): PanelType | null => {
    const lowerText = text.toLowerCase();
    for (const [trigger, panelType] of Object.entries(VOICE_PANEL_TRIGGERS)) {
      if (lowerText.includes(trigger)) {
        return panelType;
      }
    }
    return null;
  }, []);

  // End conversation
  const endConversation = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsVoiceConnected(false);
    setVoiceConnected(false);
    setVoiceState('idle');
  }, [setVoiceConnected]);

  // Execute function calls from the model
  const executeFunctionCall = useCallback(async (callId: string, name: string, args: string) => {
    console.log(`[Dashboard] Executing: ${name}`, args);
    let result = '';

    try {
      const parsedArgs = JSON.parse(args);

      // Research functions - open research panel
      if (name === 'start_research') {
        const taskId = addTask({
          type: 'research',
          title: `Research: ${parsedArgs.topic}`,
          description: `Researching "${parsedArgs.topic}"`,
          status: 'running',
        });

        const panelId = openPanel('research', {
          topic: parsedArgs.topic,
          results: [],
        });

        try {
          const response = await fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'start_research',
              topic: parsedArgs.topic,
              searchRecency: parsedArgs.searchRecency,
            }),
          });

          const data = await response.json();
          if (data.success) {
            updatePanelData(panelId, {
              sessionId: data.sessionId,
              results: [{
                id: `result-${Date.now()}`,
                topic: parsedArgs.topic,
                answer: data.answer,
                citations: data.citations || [],
                timestamp: new Date(),
              }],
            });
            completeTask(taskId, 'completed');
            result = JSON.stringify({
              success: true,
              message: `Research complete. Found information about "${parsedArgs.topic}". The results are displayed in the Research panel.`,
            });
          } else {
            completeTask(taskId, 'failed');
            result = JSON.stringify({ success: false, error: data.error });
          }
        } catch (err) {
          completeTask(taskId, 'failed');
          result = JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Research failed' });
        }
      }

      // Browser functions - open browser panel
      else if (name === 'open_browser') {
        const taskId = addTask({
          type: 'browser',
          title: `Navigate: ${parsedArgs.url}`,
          description: `Opening ${parsedArgs.url}`,
          status: 'running',
        });

        const panelId = openPanel('browser', { url: parsedArgs.url });

        try {
          const response = await fetch('/api/browser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'open', url: parsedArgs.url }),
          });

          const data = await response.json();
          if (data.success) {
            updatePanelData(panelId, {
              url: data.url,
              title: data.title,
              screenshot: data.screenshot,
            });
            updateBrowserSnapshot({
              url: data.url,
              title: data.title,
              screenshot: data.screenshot,
            });
            completeTask(taskId, 'completed');
            result = JSON.stringify({
              success: true,
              message: `Opened ${data.url}. The page "${data.title}" is now visible in the Browser panel.`,
            });
          } else {
            completeTask(taskId, 'failed');
            result = JSON.stringify({ success: false, error: data.error });
          }
        } catch (err) {
          completeTask(taskId, 'failed');
          result = JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Browser failed' });
        }
      }

      // Email functions - open email panel
      else if (name === 'read_emails' || name === 'compose_email') {
        const panelId = openPanel('email');

        if (name === 'read_emails') {
          const taskId = addTask({
            type: 'email',
            title: 'Check Emails',
            description: 'Reading email inbox',
            status: 'running',
          });

          try {
            const response = await fetch('/api/gmail', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'read', query: parsedArgs.query, maxResults: parsedArgs.maxResults || '10' }),
            });

            const data = await response.json();
            if (data.success) {
              updatePanelData(panelId, { emails: data.emails, isConfigured: true });
              completeTask(taskId, 'completed');
              const count = data.emails?.length || 0;
              result = JSON.stringify({
                success: true,
                message: `Found ${count} emails. They are displayed in the Email panel.`,
                emails: data.emails?.slice(0, 5),
              });
            } else {
              completeTask(taskId, 'failed');
              result = JSON.stringify({ success: false, error: data.error });
            }
          } catch (err) {
            completeTask(taskId, 'failed');
            result = JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Email check failed' });
          }
        } else {
          result = JSON.stringify({ success: true, message: 'Email compose panel opened.' });
        }
      }

      // Build functions - open build panel
      else if (name === 'start_build_project') {
        const taskId = addTask({
          type: 'build',
          title: `Build: ${parsedArgs.projectDescription.slice(0, 30)}...`,
          description: parsedArgs.projectDescription,
          status: 'running',
        });

        try {
          const response = await fetch('/api/build/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedArgs),
          });

          const data = await response.json();
          if (data.success) {
            const panelId = openPanel('build', {
              projectId: data.projectId,
              description: parsedArgs.projectDescription,
              phase: 'planning',
              progress: 0,
            });

            updateTask(taskId, { metadata: { projectId: data.projectId, panelId } });
            result = JSON.stringify({
              success: true,
              message: `Build started! I'm building "${parsedArgs.projectDescription}". You can watch the progress in the Build panel.`,
              projectId: data.projectId,
            });
          } else {
            completeTask(taskId, 'failed');
            result = JSON.stringify({ success: false, error: data.error });
          }
        } catch (err) {
          completeTask(taskId, 'failed');
          result = JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Build start failed' });
        }
      }

      // Other functions - execute normally
      else {
        // Default handler for other tools
        result = JSON.stringify({ success: true, message: `Executed ${name}` });
      }
    } catch (err) {
      console.error(`[Dashboard] Error executing ${name}:`, err);
      result = JSON.stringify({ error: err instanceof Error ? err.message : 'Function execution failed' });
    }

    // Send result back to OpenAI
    if (dcRef.current && dcRef.current.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: result,
        },
      }));
      dcRef.current.send(JSON.stringify({ type: 'response.create' }));
    }
  }, [openPanel, addTask, updateTask, completeTask, updatePanelData, updateBrowserSnapshot]);

  // Handle realtime events
  const handleRealtimeEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        setVoiceState('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
        setVoiceState('thinking');
        break;
      case 'response.audio.delta':
        setVoiceState('speaking');
        break;
      case 'response.audio.done':
        setVoiceState('listening');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          const userMessage = {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: event.transcript as string,
          };
          setVoiceMessages(prev => [...prev, userMessage]);

          // Detect panel triggers
          const panelType = detectPanelTrigger(event.transcript as string);
          if (panelType) {
            // Panel will be opened by function call, but we could pre-open here
          }
        }
        break;
      case 'response.audio_transcript.done':
        if (event.transcript) {
          const assistantMessage = {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: event.transcript as string,
          };
          setVoiceMessages(prev => [...prev, assistantMessage]);
        }
        break;
      case 'response.function_call_arguments.done':
        executeFunctionCall(
          event.call_id as string,
          event.name as string,
          event.arguments as string
        );
        break;
      case 'error':
        console.error('Realtime API error:', event);
        break;
    }
  }, [detectPanelTrigger, executeFunctionCall]);

  // Start conversation
  const startConversation = useCallback(async () => {
    try {
      setVoiceState('thinking');

      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Get ephemeral token
      const tokenResponse = await fetch('/api/realtime/session', { method: 'POST' });
      if (!tokenResponse.ok) throw new Error('Failed to get session token');
      const { client_secret } = await tokenResponse.json();

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Create data channel
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      // Handle incoming audio
      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play().catch(console.error);
        }
      };

      // Handle data channel messages
      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleRealtimeEvent(event);
        } catch (err) {
          console.error('Error parsing realtime event:', err);
        }
      };

      dc.onopen = () => {
        // Send session configuration
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: `You are Albert, an AI voice assistant. You have access to various tools and should use them to help the user. When you perform actions like research, browsing, or checking email, the results will be displayed in panels on the user's dashboard. Keep responses concise and natural.`,
            voice: 'echo',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
            tools: BUILD_TOOLS,
            tool_choice: 'auto',
          },
        }));

        setIsVoiceConnected(true);
        setVoiceConnected(true);
        setVoiceState('listening');
        updateServiceStatus('Voice', 'connected');
      };

      dc.onclose = endConversation;
      dc.onerror = () => endConversation();

      // Create and set offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to OpenAI
      const sdpResponse = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${client_secret.value}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        }
      );

      if (!sdpResponse.ok) throw new Error('Failed to connect to OpenAI');

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    } catch (err) {
      console.error('Error starting conversation:', err);
      endConversation();
    }
  }, [handleRealtimeEvent, endConversation, setVoiceConnected, updateServiceStatus]);

  // Open voice panel on load and set up electron event listeners
  useEffect(() => {
    const id = openPanel('voice');
    setVoicePanelId(id);

    // Also open task queue
    openPanel('task-queue');

    // Listen for Electron menu events (when running in desktop app)
    const handleOpenPanel = (e: CustomEvent<{ type: PanelType }>) => {
      openPanel(e.detail.type);
    };

    const handleOpenConfig = () => {
      openPanel('config');
    };

    const handleToggleVoice = () => {
      if (isVoiceConnected) {
        endConversation();
      } else {
        startConversation();
      }
    };

    window.addEventListener('albert-open-panel', handleOpenPanel as EventListener);
    window.addEventListener('albert-open-config', handleOpenConfig);
    window.addEventListener('albert-toggle-voice', handleToggleVoice);

    return () => {
      window.removeEventListener('albert-open-panel', handleOpenPanel as EventListener);
      window.removeEventListener('albert-open-config', handleOpenConfig);
      window.removeEventListener('albert-toggle-voice', handleToggleVoice);
    };
  }, [isVoiceConnected]);

  // Get quick action counts
  const runningTasks = state.tasks.filter(t => t.status === 'running').length;
  const connectedServices = state.services.filter(s => s.status === 'connected').length;

  return (
    <main className="min-h-screen bg-gray-950 relative overflow-hidden">
      {/* Hidden audio element */}
      <audio ref={audioRef} autoPlay />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-gray-900/95 backdrop-blur border-b border-gray-800 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 text-transparent bg-clip-text">
            Albert Mission Control
          </h1>
          <span className="text-xs text-gray-500">by Bander Labs</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Quick stats */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500">
              {runningTasks} active task{runningTasks !== 1 ? 's' : ''}
            </span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-500">
              {connectedServices}/{state.services.length} services
            </span>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => openPanel('research')}
              className="p-2 text-gray-400 hover:text-purple-400 hover:bg-gray-800 rounded-lg transition"
              title="New Research"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
            <button
              onClick={() => openPanel('browser')}
              className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition"
              title="New Browser"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </button>
            <button
              onClick={() => openPanel('email')}
              className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition"
              title="Email"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => openPanel('build')}
              className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-gray-800 rounded-lg transition"
              title="New Build"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
            <div className="w-px h-6 bg-gray-700" />
            <button
              onClick={() => openPanel('config')}
              className="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition"
              title="Configuration"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <a
              href="/"
              className="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition"
              title="Back to Voice"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* Main area with voice orb */}
      <div className="pt-14 h-screen flex items-center justify-center">
        <div className="relative">
          <EchoOrb
            state={voiceState}
            onClick={isVoiceConnected ? endConversation : startConversation}
            isConnected={isVoiceConnected}
          />

          {/* Voice status */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className={`text-sm ${
              isVoiceConnected
                ? voiceState === 'listening'
                  ? 'text-green-400'
                  : voiceState === 'speaking'
                  ? 'text-blue-400'
                  : 'text-yellow-400'
                : 'text-gray-500'
            }`}>
              {isVoiceConnected
                ? voiceState === 'listening'
                  ? 'Listening...'
                  : voiceState === 'speaking'
                  ? 'Speaking...'
                  : 'Thinking...'
                : 'Click to start'}
            </span>
          </div>
        </div>
      </div>

      {/* Panels */}
      {state.panels.map(renderPanel)}

      {/* Minimized panels dock */}
      <MinimizedDock />

      {/* Service status bar */}
      <div className="fixed bottom-0 left-0 right-0 h-8 bg-gray-900/95 backdrop-blur border-t border-gray-800 flex items-center px-4 gap-4 text-xs z-30">
        {state.services.map((service) => (
          <div key={service.name} className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                service.status === 'connected'
                  ? 'bg-green-400'
                  : service.status === 'error'
                  ? 'bg-red-400'
                  : 'bg-gray-500'
              }`}
            />
            <span className="text-gray-400">{service.name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <PasscodeGate>
      <DashboardProvider>
        <DashboardContent />
      </DashboardProvider>
    </PasscodeGate>
  );
}
