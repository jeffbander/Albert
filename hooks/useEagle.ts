'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PICOVOICE_ACCESS_KEY,
  IDENTIFICATION_THRESHOLD,
  getEnrollmentFeedback,
} from '@/lib/voiceId';

interface Speaker {
  id: string;
  name: string;
  voiceprint: string;
}

interface EnrollmentState {
  isEnrolling: boolean;
  progress: number;
  feedback: string;
  error: string | null;
}

interface IdentificationState {
  isIdentifying: boolean;
  currentSpeaker: Speaker | null;
  confidence: number;
  error: string | null;
}

export function useEagle() {
  const [enrollmentState, setEnrollmentState] = useState<EnrollmentState>({
    isEnrolling: false,
    progress: 0,
    feedback: '',
    error: null,
  });

  const [identificationState, setIdentificationState] = useState<IdentificationState>({
    isIdentifying: false,
    currentSpeaker: null,
    confidence: 0,
    error: null,
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profilerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eagleRef = useRef<any>(null);
  const speakersRef = useRef<Speaker[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processorRef = useRef<any>(null);
  const isEnrollingRef = useRef(false);

  // Check if access key is configured
  useEffect(() => {
    if (!PICOVOICE_ACCESS_KEY) {
      setInitError('Picovoice access key not configured. Set NEXT_PUBLIC_PICOVOICE_ACCESS_KEY in environment.');
    }
  }, []);

  // Stop media stream helper
  const stopMediaStream = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Start enrollment process for a new speaker
  const startEnrollment = useCallback(async (): Promise<void> => {
    if (!PICOVOICE_ACCESS_KEY) {
      setEnrollmentState(prev => ({
        ...prev,
        error: 'Picovoice access key not configured',
      }));
      return;
    }

    try {
      setEnrollmentState({
        isEnrolling: true,
        progress: 0,
        feedback: 'Starting enrollment... please speak naturally.',
        error: null,
      });
      isEnrollingRef.current = true;

      // Dynamically import Eagle to avoid SSR issues
      const { EagleProfiler } = await import('@picovoice/eagle-web');

      // Initialize the profiler with the model from public directory
      profilerRef.current = await EagleProfiler.create(PICOVOICE_ACCESS_KEY, {
        publicPath: '/eagle_params.pv',
      });

      // Set up microphone processing
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      mediaStreamRef.current = stream;

      // Eagle requires 16kHz sample rate
      const targetSampleRate = profilerRef.current.sampleRate || 16000;
      audioContextRef.current = new AudioContext({ sampleRate: targetSampleRate });
      const source = audioContextRef.current.createMediaStreamSource(stream);

      // Use ScriptProcessor for audio processing
      // Eagle requires minEnrollSamples (6144) per enroll() call, not 512!
      const minEnrollSamples = profilerRef.current.minEnrollSamples || 6144;
      const bufferSize = 4096;
      processorRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);

      // Buffer to accumulate samples - need at least minEnrollSamples per call
      let audioBuffer: number[] = [];
      let enrollCount = 0;
      let lastPercentage = 0;

      console.log('Eagle profiler initialized:', {
        sampleRate: profilerRef.current.sampleRate,
        minEnrollSamples: minEnrollSamples,
      });

      processorRef.current.onaudioprocess = async (e: AudioProcessingEvent) => {
        if (!profilerRef.current || !isEnrollingRef.current) return;

        try {
          const inputData = e.inputBuffer.getChannelData(0);

          // Accumulate samples as Int16
          for (let i = 0; i < inputData.length; i++) {
            audioBuffer.push(Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768))));
          }

          // Log buffer progress
          if (audioBuffer.length % 8192 < bufferSize) {
            console.log('Buffer size:', audioBuffer.length, '/', minEnrollSamples);
          }

          // Process when we have enough samples
          while (audioBuffer.length >= minEnrollSamples) {
            const frame = new Int16Array(audioBuffer.splice(0, minEnrollSamples));

            try {
              const result = await profilerRef.current.enroll(frame);
              enrollCount++;

              console.log('Enroll result:', {
                percentage: result.percentage,
                feedback: result.feedback,
                enrollCount: enrollCount,
              });

              if (result.percentage !== lastPercentage) {
                lastPercentage = result.percentage;
                setEnrollmentState(prev => ({
                  ...prev,
                  progress: result.percentage,
                  feedback: getEnrollmentFeedback(result.percentage),
                }));
              }
            } catch (enrollErr) {
              console.error('Enroll error:', enrollErr);
            }
          }
        } catch (err) {
          console.error('Audio processing error:', err);
        }
      };

      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to start enrollment:', error);
      isEnrollingRef.current = false;
      stopMediaStream();
      setEnrollmentState(prev => ({
        ...prev,
        isEnrolling: false,
        error: error instanceof Error ? error.message : 'Failed to start enrollment',
      }));
    }
  }, [stopMediaStream]);

  // Complete enrollment and export voiceprint
  const completeEnrollment = useCallback(async (): Promise<string | null> => {
    if (!profilerRef.current) {
      return null;
    }

    isEnrollingRef.current = false;

    try {
      const profile = await profilerRef.current.export();

      // Convert profile to base64 string
      const voiceprint = btoa(String.fromCharCode(...new Uint8Array(profile.bytes)));

      // Clean up
      stopMediaStream();
      await profilerRef.current.release();
      profilerRef.current = null;

      setEnrollmentState({
        isEnrolling: false,
        progress: 100,
        feedback: 'Enrollment complete!',
        error: null,
      });

      return voiceprint;
    } catch (error) {
      console.error('Failed to complete enrollment:', error);
      setEnrollmentState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to complete enrollment',
      }));
      return null;
    }
  }, [stopMediaStream]);

  // Cancel enrollment
  const cancelEnrollment = useCallback(async () => {
    isEnrollingRef.current = false;
    stopMediaStream();

    if (profilerRef.current) {
      await profilerRef.current.release();
      profilerRef.current = null;
    }

    setEnrollmentState({
      isEnrolling: false,
      progress: 0,
      feedback: '',
      error: null,
    });
  }, [stopMediaStream]);

  // Load speakers for identification
  const loadSpeakers = useCallback(async (speakers: Speaker[]): Promise<void> => {
    if (!PICOVOICE_ACCESS_KEY) {
      setIdentificationState(prev => ({
        ...prev,
        error: 'Picovoice access key not configured',
      }));
      return;
    }

    try {
      speakersRef.current = speakers;

      // Convert base64 voiceprints to Eagle profiles
      const profiles = speakers.map(s => {
        const bytes = Uint8Array.from(atob(s.voiceprint), c => c.charCodeAt(0));
        return { bytes };
      });

      if (profiles.length === 0) {
        return;
      }

      // Dynamically import Eagle
      const { Eagle } = await import('@picovoice/eagle-web');

      // Initialize Eagle for identification
      eagleRef.current = await Eagle.create(
        PICOVOICE_ACCESS_KEY,
        { publicPath: '/eagle_params.pv' },
        profiles
      );

      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to load speakers:', error);
      setInitError(error instanceof Error ? error.message : 'Failed to initialize speaker identification');
    }
  }, []);

  // Identify speaker from audio buffer
  const identifySpeaker = useCallback(async (audioData: Int16Array): Promise<Speaker | null> => {
    if (!eagleRef.current || speakersRef.current.length === 0) {
      return null;
    }

    try {
      const scores = await eagleRef.current.process(audioData);

      // Find best match
      let bestIndex = -1;
      let bestScore = 0;

      scores.forEach((score: number, index: number) => {
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      if (bestScore >= IDENTIFICATION_THRESHOLD && bestIndex >= 0) {
        const speaker = speakersRef.current[bestIndex];
        setIdentificationState({
          isIdentifying: false,
          currentSpeaker: speaker,
          confidence: bestScore,
          error: null,
        });
        return speaker;
      }

      setIdentificationState({
        isIdentifying: false,
        currentSpeaker: null,
        confidence: bestScore,
        error: null,
      });
      return null;
    } catch (error) {
      console.error('Identification error:', error);
      setIdentificationState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Identification failed',
      }));
      return null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopMediaStream();
      if (profilerRef.current) {
        profilerRef.current.release();
      }
      if (eagleRef.current) {
        eagleRef.current.release();
      }
    };
  }, [stopMediaStream]);

  return {
    // State
    enrollmentState,
    identificationState,
    isInitialized,
    initError,

    // Enrollment methods
    startEnrollment,
    completeEnrollment,
    cancelEnrollment,

    // Identification methods
    loadSpeakers,
    identifySpeaker,
  };
}
