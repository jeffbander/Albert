'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import EchoOrb, { EchoState } from '@/components/EchoOrb';
import StatusIndicator from '@/components/StatusIndicator';
import PasscodeGate from '@/components/PasscodeGate';
import { useEagle } from '@/hooks/useEagle';
import { BUILD_TOOLS } from '@/lib/buildTools';
import {
  subscribeToBuild,
  unsubscribeAll,
  formatProgressForVoice,
  shouldNotifyVoice,
} from '@/lib/buildProgressManager';
import { onClarificationRequest } from '@/lib/interactiveSession';
import type { BuildProgressEvent } from '@/types/build';

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
  const pendingFunctionCallRef = useRef<{ callId: string; name: string; arguments: string } | null>(null);

  // Build progress tracking
  const activeBuildIdRef = useRef<string | null>(null);
  const lastNotifiedPhaseRef = useRef<string | null>(null);
  const buildUnsubscribeRef = useRef<(() => void) | null>(null);
  const clarificationUnsubscribeRef = useRef<(() => void) | null>(null);

  // Voice identification
  const { loadSpeakers, identifySpeaker } = useEagle();

  // Cleanup function
  const cleanup = useCallback(async () => {
    // Clear silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Cleanup build subscriptions
    if (buildUnsubscribeRef.current) {
      buildUnsubscribeRef.current();
      buildUnsubscribeRef.current = null;
    }
    if (clarificationUnsubscribeRef.current) {
      clarificationUnsubscribeRef.current();
      clarificationUnsubscribeRef.current = null;
    }
    unsubscribeAll();
    activeBuildIdRef.current = null;
    lastNotifiedPhaseRef.current = null;

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
        // Send session configuration with build tools
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: context.systemPrompt,
            voice: 'echo',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
            tools: BUILD_TOOLS,
            tool_choice: 'auto',
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

  // Make Albert speak proactively (for build updates)
  const speakProactively = useCallback((message: string) => {
    if (dcRef.current && dcRef.current.readyState === 'open') {
      // Create a text message item that Albert will read out
      dcRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `[System: Build Update] ${message}. Please acknowledge this update briefly to the user.`,
            },
          ],
        },
      }));

      // Request Albert to respond
      dcRef.current.send(JSON.stringify({
        type: 'response.create',
      }));
    }
  }, []);

  // Subscribe to build progress updates
  const subscribeToBuildProgress = useCallback((projectId: string, projectDescription: string) => {
    // Unsubscribe from previous build if any
    if (buildUnsubscribeRef.current) {
      buildUnsubscribeRef.current();
    }
    if (clarificationUnsubscribeRef.current) {
      clarificationUnsubscribeRef.current();
    }

    activeBuildIdRef.current = projectId;
    lastNotifiedPhaseRef.current = null;

    const unsubscribe = subscribeToBuild(projectId, {
      onProgress: (event: BuildProgressEvent) => {
        // Only speak on significant changes
        if (shouldNotifyVoice(event, lastNotifiedPhaseRef.current || undefined)) {
          lastNotifiedPhaseRef.current = event.phase;
          const voiceMessage = formatProgressForVoice(event);
          console.log(`[Build Progress] ${event.phase}: ${voiceMessage}`);
          speakProactively(voiceMessage);
        }
      },
      onComplete: async (pid: string, success: boolean, message: string) => {
        console.log(`[Build Complete] ${pid}: ${success ? 'Success' : 'Failed'} - ${message}`);

        // Fetch project details so Albert has full context about what was built
        let projectContext = '';
        let memorySummary = '';
        if (success) {
          try {
            const describeRes = await fetch(`/api/build/${pid}/describe`);
            const describeData = await describeRes.json();
            if (describeData.success && describeData.summary) {
              projectContext = ` Here's what was built: ${describeData.summary}`;
              memorySummary = describeData.summary;
              if (describeData.files?.length > 0) {
                const keyFiles = describeData.files.slice(0, 5).join(', ');
                projectContext += ` Key files include: ${keyFiles}.`;
              }
            }
          } catch (err) {
            console.error('[Build Complete] Failed to fetch project details:', err);
          }

          // Save to Albert's memory so he remembers this build across conversations
          try {
            await fetch('/api/memory/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `I built a project for the user: "${projectDescription}". ${memorySummary}`,
                metadata: {
                  type: 'build_completed',
                  projectId: pid,
                  description: projectDescription,
                },
              }),
            });
            console.log('[Build Complete] Saved build to memory');
          } catch (err) {
            console.error('[Build Complete] Failed to save to memory:', err);
          }
        }

        speakProactively(success
          ? `Great news! Your project "${projectDescription}" is now complete and running. ${message}${projectContext}`
          : `I'm sorry, but there was an issue with the build. ${message}`
        );
        activeBuildIdRef.current = null;
        buildUnsubscribeRef.current = null;
        if (clarificationUnsubscribeRef.current) {
          clarificationUnsubscribeRef.current();
          clarificationUnsubscribeRef.current = null;
        }
      },
      onError: (pid: string, error: string) => {
        console.log(`[Build Error] ${pid}: ${error}`);
        speakProactively(`Unfortunately, there was an error with the build: ${error}. You can ask me to retry with modifications.`);
        activeBuildIdRef.current = null;
        buildUnsubscribeRef.current = null;
        if (clarificationUnsubscribeRef.current) {
          clarificationUnsubscribeRef.current();
          clarificationUnsubscribeRef.current = null;
        }
      },
    });

    buildUnsubscribeRef.current = unsubscribe;

    // Also subscribe to clarification requests from interactive sessions
    const clarificationUnsub = onClarificationRequest(projectId, (data) => {
      console.log(`[Clarification Request] ${projectId}:`, data.question);
      // Format the question for voice
      const optionsText = data.options?.length
        ? ` Options are: ${data.options.join(', ')}.`
        : '';
      speakProactively(
        `I have a question about the build: ${data.question}${optionsText} Please tell me what you'd prefer.`
      );
    });
    clarificationUnsubscribeRef.current = clarificationUnsub;
  }, [speakProactively]);

  // Execute function calls from the model
  const executeFunctionCall = useCallback(async (callId: string, name: string, args: string) => {
    console.log(`[FunctionCall] Executing: ${name}`, args);

    let result = '';

    try {
      const parsedArgs = JSON.parse(args);

      switch (name) {
        case 'start_build_project': {
          const response = await fetch('/api/build/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedArgs),
          });
          const data = await response.json();
          if (data.success) {
            // Subscribe to build progress for proactive voice updates
            subscribeToBuildProgress(data.projectId, parsedArgs.projectDescription);
            result = JSON.stringify({
              success: true,
              message: `Build started! Project ID: ${data.projectId}. I'm now autonomously building "${parsedArgs.projectDescription}". I'll keep you updated on the progress and let you know when it's done.`,
              projectId: data.projectId,
            });
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Failed to start build' });
          }
          break;
        }

        case 'check_build_status': {
          const projectId = parsedArgs.projectId;
          let url = '/api/build/projects';
          if (projectId) {
            url = `/api/build/${projectId}/status`;
          }
          const response = await fetch(url);
          const data = await response.json();
          if (data.success) {
            if (data.project) {
              // Single project status
              result = JSON.stringify({
                success: true,
                project: {
                  id: data.project.id,
                  description: data.project.description,
                  status: data.project.status,
                  projectType: data.project.projectType,
                  localPort: data.project.localPort,
                  deployUrl: data.project.deployUrl,
                },
                recentLogs: data.logs?.slice(-5) || [],
              });
            } else if (data.projects) {
              // Most recent project
              const latest = data.projects[0];
              if (latest) {
                result = JSON.stringify({
                  success: true,
                  message: `Most recent project: "${latest.description.slice(0, 50)}..." - Status: ${latest.status}`,
                  project: latest,
                });
              } else {
                result = JSON.stringify({ success: true, message: 'No projects found.' });
              }
            } else {
              result = JSON.stringify({ success: true, message: 'No projects found.' });
            }
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Failed to get status' });
          }
          break;
        }

        case 'modify_project': {
          const { projectId, changeDescription } = parsedArgs;
          const response = await fetch(`/api/build/${projectId}/modify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ changeDescription }),
          });
          const data = await response.json();
          if (data.success) {
            result = JSON.stringify({
              success: true,
              message: `Modification started for project ${projectId}. I'm implementing the changes: "${changeDescription}"`,
            });
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Failed to modify project' });
          }
          break;
        }

        case 'list_projects': {
          const response = await fetch('/api/build/projects');
          const data = await response.json();
          if (data.success) {
            const projects = data.projects.slice(0, parseInt(parsedArgs.limit) || 10);
            result = JSON.stringify({
              success: true,
              count: projects.length,
              projects: projects.map((p: { id: string; description: string; status: string; projectType: string; localPort?: number }) => ({
                id: p.id,
                description: p.description.slice(0, 50) + '...',
                status: p.status,
                type: p.projectType,
                port: p.localPort,
              })),
            });
          } else {
            result = JSON.stringify({ success: false, error: 'Failed to list projects' });
          }
          break;
        }

        case 'deploy_project': {
          const { projectId, production } = parsedArgs;
          const response = await fetch(`/api/build/${projectId}/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ production: production === 'true' }),
          });
          const data = await response.json();
          if (data.success) {
            result = JSON.stringify({
              success: true,
              message: `Deployed to Vercel! Your project is live at ${data.url}`,
              url: data.url,
            });
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Deployment failed' });
          }
          break;
        }

        case 'push_to_github': {
          const { projectId, owner, repo, commitMessage } = parsedArgs;
          // Get GitHub username if owner not provided
          const ghOwner = owner || 'jeffbander'; // Default to user's GitHub
          const response = await fetch(`/api/build/${projectId}/github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner: ghOwner,
              repo,
              commitMessage: commitMessage || `Built with Albert: ${repo}`,
            }),
          });
          const data = await response.json();
          if (data.success) {
            result = JSON.stringify({
              success: true,
              message: `Pushed to GitHub! Repository: ${data.repoUrl}`,
              repoUrl: data.repoUrl,
              commitHash: data.commitHash,
            });
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Push to GitHub failed' });
          }
          break;
        }

        case 'cancel_build': {
          let targetProjectId = parsedArgs.projectId;
          // If no project ID, get the most recent running build
          if (!targetProjectId) {
            const projectsRes = await fetch('/api/build/projects');
            const projectsData = await projectsRes.json();
            const runningBuild = projectsData.projects?.find((p: { status: string }) =>
              ['building', 'planning', 'testing', 'deploying'].includes(p.status)
            );
            targetProjectId = runningBuild?.id;
          }
          if (!targetProjectId) {
            result = JSON.stringify({ success: false, error: 'No running build found to cancel' });
          } else {
            // Unsubscribe from build progress if this was our active build
            if (activeBuildIdRef.current === targetProjectId && buildUnsubscribeRef.current) {
              buildUnsubscribeRef.current();
              buildUnsubscribeRef.current = null;
              activeBuildIdRef.current = null;
            }
            const response = await fetch(`/api/build/${targetProjectId}/cancel`, { method: 'POST' });
            const data = await response.json();
            result = JSON.stringify(data);
          }
          break;
        }

        case 'retry_build': {
          const { projectId, modifications } = parsedArgs;
          const response = await fetch(`/api/build/${projectId}/retry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modifications }),
          });
          const data = await response.json();
          if (data.success) {
            // Subscribe to the new build progress
            subscribeToBuildProgress(data.newProjectId, modifications || 'Retried project');
            result = JSON.stringify({
              success: true,
              message: `Retry started! New build ID: ${data.newProjectId}. I'll keep you updated on the progress.`,
              newProjectId: data.newProjectId,
            });
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Failed to retry build' });
          }
          break;
        }

        case 'open_project': {
          let targetProjectId = parsedArgs.projectId;
          // If no project ID, get the most recent completed project
          if (!targetProjectId) {
            const projectsRes = await fetch('/api/build/projects');
            const projectsData = await projectsRes.json();
            const completedBuild = projectsData.projects?.find((p: { status: string }) => p.status === 'complete');
            targetProjectId = completedBuild?.id;
          }
          if (!targetProjectId) {
            result = JSON.stringify({ success: false, error: 'No completed project found to open' });
          } else {
            const statusRes = await fetch(`/api/build/${targetProjectId}/status`);
            const statusData = await statusRes.json();
            if (statusData.success && statusData.project?.localPort) {
              result = JSON.stringify({
                success: true,
                message: `The project is running at http://localhost:${statusData.project.localPort}. You can open it in your browser.`,
                url: `http://localhost:${statusData.project.localPort}`,
              });
            } else if (statusData.project?.deployUrl) {
              result = JSON.stringify({
                success: true,
                message: `The project is deployed at ${statusData.project.deployUrl}`,
                url: statusData.project.deployUrl,
              });
            } else {
              result = JSON.stringify({ success: false, error: 'Project is not currently running' });
            }
          }
          break;
        }

        case 'describe_project': {
          const { projectId } = parsedArgs;
          const response = await fetch(`/api/build/${projectId}/describe`);
          const data = await response.json();
          if (data.success) {
            result = JSON.stringify({
              success: true,
              summary: data.summary,
              files: data.files?.slice(0, 15),
              readme: data.readme?.slice(0, 500),
            });
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Failed to describe project' });
          }
          break;
        }

        case 'respond_to_build': {
          const { projectId, response: userResponse } = parsedArgs;
          const apiResponse = await fetch(`/api/build/${projectId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: userResponse }),
          });
          const data = await apiResponse.json();
          if (data.success) {
            result = JSON.stringify({
              success: true,
              message: `Response sent to the build. Continuing with: "${userResponse}"`,
            });
          } else {
            result = JSON.stringify({ success: false, error: data.error || 'Failed to send response' });
          }
          break;
        }

        case 'get_pending_question': {
          const { projectId } = parsedArgs;
          if (projectId) {
            const response = await fetch(`/api/build/${projectId}/respond`);
            const data = await response.json();
            if (data.success && data.hasActiveSession && data.session?.pendingQuestion) {
              result = JSON.stringify({
                success: true,
                hasPendingQuestion: true,
                question: data.session.pendingQuestion,
                projectId,
              });
            } else {
              result = JSON.stringify({
                success: true,
                hasPendingQuestion: false,
                message: 'No pending question for this project.',
              });
            }
          } else {
            // Check all active builds for pending questions
            const projectsRes = await fetch('/api/build/projects');
            const projectsData = await projectsRes.json();
            const activeProjects = projectsData.projects?.filter((p: { status: string }) =>
              ['building', 'planning', 'testing'].includes(p.status)
            ) || [];

            for (const project of activeProjects) {
              const response = await fetch(`/api/build/${project.id}/respond`);
              const data = await response.json();
              if (data.success && data.hasActiveSession && data.session?.pendingQuestion) {
                result = JSON.stringify({
                  success: true,
                  hasPendingQuestion: true,
                  question: data.session.pendingQuestion,
                  projectId: project.id,
                  projectDescription: project.description,
                });
                break;
              }
            }

            if (!result) {
              result = JSON.stringify({
                success: true,
                hasPendingQuestion: false,
                message: 'No pending questions from any active builds.',
              });
            }
          }
          break;
        }

        default:
          result = JSON.stringify({ error: `Unknown function: ${name}` });
      }
    } catch (err) {
      console.error(`[FunctionCall] Error executing ${name}:`, err);
      result = JSON.stringify({ error: err instanceof Error ? err.message : 'Function execution failed' });
    }

    // Send the function result back to the conversation
    if (dcRef.current && dcRef.current.readyState === 'open') {
      // First, create a function call output item
      dcRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: result,
        },
      }));

      // Then request a response so Albert speaks the result
      dcRef.current.send(JSON.stringify({
        type: 'response.create',
      }));
    }
  }, [subscribeToBuildProgress]);

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

      case 'response.function_call_arguments.done':
        // Store the function call info for execution
        pendingFunctionCallRef.current = {
          callId: event.call_id as string,
          name: event.name as string,
          arguments: event.arguments as string,
        };
        // Execute the function call
        executeFunctionCall(
          event.call_id as string,
          event.name as string,
          event.arguments as string
        );
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
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Knowledge Graph
          </a>
          <a
            href="/builder"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-400 hover:text-cyan-400 transition-colors flex items-center gap-2"
            title="Albert Builder Dashboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Builder
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
