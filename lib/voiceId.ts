/**
 * Voice Identification Service using Picovoice Eagle
 *
 * This service handles:
 * - Speaker enrollment (creating voiceprints)
 * - Speaker identification (recognizing who's talking)
 * - Managing speaker profiles
 */

// Types for Eagle speaker recognition
export interface SpeakerEnrollmentResult {
  speakerId: string;
  name: string;
  voiceprint: string;
  feedbackMessage: string;
}

export interface SpeakerIdentificationResult {
  speakerId: string | null;
  speakerName: string | null;
  confidence: number;
  isNewSpeaker: boolean;
}

export interface EnrollmentProgress {
  percentage: number;
  feedback: string;
}

// Eagle access key - needs to be set in environment
export const PICOVOICE_ACCESS_KEY = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || '';

// Minimum confidence threshold for speaker identification
export const IDENTIFICATION_THRESHOLD = 0.7;

// Minimum enrollment audio duration (seconds)
export const MIN_ENROLLMENT_DURATION = 10;

// Helper to convert Float32Array to base64 for storage
export function float32ArrayToBase64(float32Array: Float32Array): string {
  const uint8Array = new Uint8Array(float32Array.buffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

// Helper to convert base64 back to Float32Array
export function base64ToFloat32Array(base64: string): Float32Array {
  const binary = atob(base64);
  const uint8Array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }
  return new Float32Array(uint8Array.buffer);
}

// Get enrollment feedback based on percentage
export function getEnrollmentFeedback(percentage: number): string {
  if (percentage < 25) {
    return "Keep talking naturally - tell me about your day!";
  } else if (percentage < 50) {
    return "Great! Keep going - maybe share a fun memory.";
  } else if (percentage < 75) {
    return "Almost there! A bit more and I'll remember your voice.";
  } else if (percentage < 100) {
    return "Just a little more - you're doing great!";
  } else {
    return "Perfect! I've got your voice now.";
  }
}
