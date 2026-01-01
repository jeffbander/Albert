'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import EchoOrb, { EchoState } from '@/components/EchoOrb';
import StatusIndicator from '@/components/StatusIndicator';
import PasscodeGate from '@/components/PasscodeGate';
import { useEagle } from '@/hooks/useEagle';

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationContext {
  lastConversation: string | null;
  recentMemories: Array<{ id: string; memory: string }>;
  greeting: string;
  systemPrompt: string;
}

interface Speaker {
  id: string;
  name: string;
  voiceprint: string;
}

export default function Home() {
  const [state, setState] = useState<EchoState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifiedSpeaker, setIdentifiedSpeaker] = useState<Speaker | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contextRef = useRef<ConversationContext | null>(null);
  const speakerIdRef = useRef<string | null>(null);

  // Voice identification
  const { loadSpeakers, identifySpeaker } = useEagle();

  // Cleanup function
  const cleanup = useCallback(async () => {
    // Clear silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // End conversation if we have one
    if (conversationIdRef.current && startTimeRef.current) {
      const duration = (Date.now() - startTimeRef.current) / 1000;
      try {
        await fetch('/api/conversation/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: conversationIdRef.current,
            duration,
            messages: messagesRef.current,
            speakerId: speakerIdRef.current,
          }),
        });
      } catch (e) {
        console.error('Error ending conversation:', e);
      }
    }

    // Close data channel
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Reset state
    conversationIdRef.current = null;
    startTimeRef.current = null;
    messagesRef.current = [];
    speakerIdRef.current = null;
    setIdentifiedSpeaker(null);
    setIsConnected(false);
    setState('idle');
  }, []);

  // Identify speaker from audio stream
  const identifySpeakerFromStream = useCallback(async (stream: MediaStream): Promise<Speaker | null> => {
    console.log('[VoiceID] Starting speaker identification...');
    try {
      // Load voiceprints from API
      const voiceprintsResponse = await fetch('/api/speakers/voiceprints');
      if (!voiceprintsResponse.ok) {
        console.log('[VoiceID] Failed to fetch voiceprints:', voiceprintsResponse.status);
        return null;
      }
      const { voiceprints } = await voiceprintsResponse.json();
      console.log('[VoiceID] Fetched voiceprints:', voiceprints?.length || 0);

      if (!voiceprints || voiceprints.length === 0) {
        console.log('[VoiceID] No enrolled speakers to identify');
        return null;
      }

      // Load speakers into Eagle
      console.log('[VoiceID] Loading speakers into Eagle...');
      await loadSpeakers(voiceprints);
      console.log('[VoiceID] Speakers loaded, capturing audio...');

      // Capture audio for identification (2 seconds)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      const audioBuffer: number[] = [];
      const capturePromise = new Promise<Int16Array>((resolve) => {
        const startTime = Date.now();
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          for (let i = 0; i < inputData.length; i++) {
            audioBuffer.push(Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768))));
          }
          // Capture for 2 seconds
          if (Date.now() - startTime >= 2000) {
            processor.disconnect();
            source.disconnect();
            audioContext.close();
            console.log('[VoiceID] Captured', audioBuffer.length, 'samples');
            resolve(new Int16Array(audioBuffer));
          }
        };
      });

      source.connect(processor);
      processor.connect(audioContext.destination);

      const samples = await capturePromise;

      // Run identification
      console.log('[VoiceID] Running identification...');
      const speaker = await identifySpeaker(samples);
      console.log('[VoiceID] Identification result:', speaker?.name || 'no match');
      return speaker;
    } catch (err) {
      console.error('Voice identification error:', err);
      return null;
    }
  }, [loadSpeakers, identifySpeaker]);

  // Start conversation
  const startConversation = useCallback(async () => {
    try {
      setError(null);
      setState('thinking');

      // Get microphone access first (needed for both identification and conversation)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;

      // Try to identify the speaker (parallel with ephemeral token fetch)
      const [speaker, tokenResponse] = await Promise.all([
        identifySpeakerFromStream(stream),
        fetch('/api/realtime/session', { method: 'POST' }),
      ]);

      if (speaker) {
        console.log('Identified speaker:', speaker.name);
        setIdentifiedSpeaker(speaker);
        speakerIdRef.current = speaker.id;
      }

      // Get ephemeral token
      if (!tokenResponse.ok) throw new Error('Failed to get session token');
      const { client_secret } = await tokenResponse.json();

      // Get conversation context with speaker ID
      const contextUrl = speaker
        ? `/api/conversation/context?speakerId=${speaker.id}`
        : '/api/conversation/context';
      const contextResponse = await fetch(contextUrl);
      if (!contextResponse.ok) throw new Error('Failed to get context');
      const context: ConversationContext = await contextResponse.json();
      contextRef.current = context;

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Add audio track
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
            instructions: context.systemPrompt,
            voice: 'echo',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
          },
        }));

        // Generate conversation ID
        conversationIdRef.current = crypto.randomUUID();
        startTimeRef.current = Date.now();

        // Create conversation in database
        fetch('/api/conversation/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: conversationIdRef.current }),
        }).catch(console.error);

        setIsConnected(true);
        setState('listening');
      };

      dc.onclose = () => {
        cleanup();
      };

      dc.onerror = (err) => {
        console.error('Data channel error:', err);
        setError('Connection error occurred');
        cleanup();
      };

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
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
      cleanup();
    }
  }, [cleanup, identifySpeakerFromStream]);

  // Handle realtime events from OpenAI
  const handleRealtimeEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
    // Reset silence timeout on any activity
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }

    // Set new silence timeout (2 minutes)
    silenceTimeoutRef.current = setTimeout(() => {
      console.log('Silence timeout reached, ending conversation');
      cleanup();
    }, 2 * 60 * 1000);

    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        setState('listening');
        break;

      case 'input_audio_buffer.speech_stopped':
        setState('thinking');
        break;

      case 'response.audio.delta':
        setState('speaking');
        break;

      case 'response.audio.done':
        setState('listening');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          messagesRef.current.push({
            id: crypto.randomUUID(),
            role: 'user',
            content: event.transcript as string,
          });

          // Search for relevant memories based on what user said
          fetch('/api/memory/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: event.transcript }),
          }).catch(console.error);
        }
        break;

      case 'response.audio_transcript.done':
        if (event.transcript) {
          const messageId = crypto.randomUUID();
          messagesRef.current.push({
            id: messageId,
            role: 'assistant',
            content: event.transcript as string,
          });

          // Show feedback UI after Albert finishes speaking
          setLastMessageId(messageId);
          setFeedbackGiven(null);
          setShowFeedback(true);

          // Auto-hide feedback after 10 seconds if no interaction
          setTimeout(() => {
            setShowFeedback(false);
          }, 10000);
        }
        break;

      case 'error':
        console.error('Realtime API error:', event);
        setError('An error occurred during the conversation');
        break;
    }
  }, [cleanup]);

  // Submit feedback for a response
  const submitFeedback = useCallback(async (rating: 'up' | 'down') => {
    if (!conversationIdRef.current || !lastMessageId) return;

    setFeedbackGiven(rating);

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          messageId: lastMessageId,
          rating,
        }),
      });
      console.log(`Feedback submitted: ${rating}`);
    } catch (err) {
      console.error('Error submitting feedback:', err);
    }

    // Hide feedback UI after a short delay
    setTimeout(() => {
      setShowFeedback(false);
      setFeedbackGiven(null);
    }, 1500);
  }, [lastMessageId]);

  // Toggle conversation
  const handleOrbClick = useCallback(() => {
    if (isConnected) {
      cleanup();
    } else {
      startConversation();
    }
  }, [isConnected, cleanup, startConversation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return (
    <PasscodeGate>
      <main className="min-h-screen bg-gradient-animated flex flex-col items-center justify-center p-4">
        {/* Hidden audio element for playback */}
        <audio ref={audioRef} autoPlay />

        {/* Header */}
        <div className="absolute top-8 left-8">
          <h1 className="text-2xl font-light text-gray-300 tracking-wider">Albert</h1>
          <p className="text-xs text-gray-500 mt-1">by Bander Labs</p>
        </div>

        {/* Status indicator and links */}
        <div className="absolute top-8 right-8 flex items-center gap-4">
          <a
            href="/speakers"
            className="text-sm text-gray-400 hover:text-green-400 transition-colors flex items-center gap-2"
            title="Manage voice profiles"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Voice ID
          </a>
          <a
            href="/graph"
            className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Knowledge Graph
          </a>
          <StatusIndicator state={state} isConnected={isConnected} />
        </div>

        {/* Main orb */}
        <EchoOrb
          state={state}
          onClick={handleOrbClick}
          isConnected={isConnected}
        />

        {/* Speaker identification indicator */}
        {isConnected && identifiedSpeaker && (
          <div className="absolute top-1/2 mt-32 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-green-500/20 border border-green-500/50 text-green-300 px-4 py-2 rounded-full text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Talking to {identifiedSpeaker.name}
          </div>
        )}

        {/* Feedback UI - appears after Albert speaks */}
        {isConnected && showFeedback && (
          <div className="absolute top-1/2 mt-48 left-1/2 -translate-x-1/2 flex items-center gap-3">
            {feedbackGiven ? (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
                feedbackGiven === 'up'
                  ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                  : 'bg-red-500/20 border border-red-500/50 text-red-300'
              }`}>
                {feedbackGiven === 'up' ? '👍' : '👎'} Thanks for the feedback!
              </div>
            ) : (
              <>
                <span className="text-gray-500 text-xs">Was that helpful?</span>
                <button
                  onClick={() => submitFeedback('up')}
                  className="p-2 rounded-full bg-gray-800/50 border border-gray-700 hover:bg-green-500/20 hover:border-green-500/50 text-gray-400 hover:text-green-300 transition-all"
                  title="Thumbs up"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                </button>
                <button
                  onClick={() => submitFeedback('down')}
                  className="p-2 rounded-full bg-gray-800/50 border border-gray-700 hover:bg-red-500/20 hover:border-red-500/50 text-gray-400 hover:text-red-300 transition-all"
                  title="Thumbs down"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Instructions */}
        {!isConnected && !error && (
          <p className="absolute bottom-20 text-gray-500 text-sm">
            Click the orb to start a conversation
          </p>
        )}

        {/* Footer */}
        <div className="absolute bottom-4 text-center">
          <p className="text-xs text-gray-600">
            Created by <span className="text-purple-400">Bander Labs</span>
          </p>
        </div>
      </main>
    </PasscodeGate>
  );
}
