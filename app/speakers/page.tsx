'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import PasscodeGate from '@/components/PasscodeGate';
import { useEagle } from '@/hooks/useEagle';

interface Speaker {
  id: string;
  name: string;
  enrolled_at: string;
  last_seen: string;
  total_conversations: number;
  total_minutes: number;
  relationship_notes: string | null;
}

export default function SpeakersPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [enrollmentStep, setEnrollmentStep] = useState<'name' | 'recording' | 'complete'>('name');
  const [error, setError] = useState<string | null>(null);

  const {
    enrollmentState,
    startEnrollment,
    completeEnrollment,
    cancelEnrollment,
    initError,
  } = useEagle();

  // Fetch speakers on mount
  useEffect(() => {
    fetchSpeakers();
  }, []);

  const fetchSpeakers = async () => {
    try {
      const response = await fetch('/api/speakers');
      if (!response.ok) throw new Error('Failed to fetch speakers');
      const data = await response.json();
      setSpeakers(data.speakers);
    } catch (err) {
      console.error('Error fetching speakers:', err);
      setError('Failed to load speakers');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEnrollment = useCallback(() => {
    setIsEnrolling(true);
    setEnrollmentStep('name');
    setNewSpeakerName('');
    setError(null);
  }, []);

  const handleNameSubmit = useCallback(async () => {
    if (!newSpeakerName.trim()) {
      setError('Please enter a name');
      return;
    }

    setEnrollmentStep('recording');
    await startEnrollment();
  }, [newSpeakerName, startEnrollment]);

  const handleCompleteEnrollment = useCallback(async () => {
    const voiceprint = await completeEnrollment();

    if (!voiceprint) {
      setError('Failed to create voiceprint');
      return;
    }

    try {
      const response = await fetch('/api/speakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSpeakerName,
          voiceprint,
        }),
      });

      if (!response.ok) throw new Error('Failed to save speaker');

      setEnrollmentStep('complete');
      await fetchSpeakers();

      // Reset after a moment
      setTimeout(() => {
        setIsEnrolling(false);
        setEnrollmentStep('name');
        setNewSpeakerName('');
      }, 2000);
    } catch (err) {
      console.error('Error saving speaker:', err);
      setError('Failed to save speaker profile');
    }
  }, [completeEnrollment, newSpeakerName]);

  const handleCancelEnrollment = useCallback(async () => {
    await cancelEnrollment();
    setIsEnrolling(false);
    setEnrollmentStep('name');
    setNewSpeakerName('');
    setError(null);
  }, [cancelEnrollment]);

  const handleDeleteSpeaker = useCallback(async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}'s voice profile?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/speakers?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete speaker');

      await fetchSpeakers();
    } catch (err) {
      console.error('Error deleting speaker:', err);
      setError('Failed to delete speaker');
    }
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading speakers...</div>
      </div>
    );
  }

  return (
    <PasscodeGate>
      <div className="min-h-screen bg-gray-900 text-white p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-purple-400">Voice Profiles</h1>
            <p className="text-gray-400 mt-1">
              Albert can recognize who&apos;s talking and personalize the experience
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
          >
            ← Back to Chat
          </Link>
        </div>

        {/* API Key Warning */}
        {initError && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 mb-6">
            <h3 className="text-red-400 font-semibold mb-1">Configuration Required</h3>
            <p className="text-red-300 text-sm">{initError}</p>
            <p className="text-red-300 text-sm mt-2">
              Get a free API key at{' '}
              <a
                href="https://console.picovoice.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                console.picovoice.ai
              </a>
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 mb-6">
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 text-sm underline mt-2"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Speaker List */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-purple-300">Enrolled Speakers</h2>
                <button
                  onClick={handleStartEnrollment}
                  disabled={isEnrolling || !!initError}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition flex items-center gap-2"
                >
                  <span className="text-lg">+</span>
                  Add Voice
                </button>
              </div>

              {speakers.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-6xl mb-4">🎤</div>
                  <p className="text-lg mb-2">No voices enrolled yet</p>
                  <p className="text-sm">
                    Add a voice profile so Albert can recognize who&apos;s talking
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {speakers.map((speaker) => (
                    <div
                      key={speaker.id}
                      className="bg-gray-700/50 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-xl font-bold">
                          {speaker.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{speaker.name}</h3>
                          <div className="text-sm text-gray-400">
                            <span>{speaker.total_conversations} conversations</span>
                            <span className="mx-2">•</span>
                            <span>{speaker.total_minutes} min</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Enrolled {formatDate(speaker.enrolled_at)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSpeaker(speaker.id, speaker.name)}
                        className="p-2 text-gray-400 hover:text-red-400 transition"
                        title="Remove voice profile"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Enrollment Panel */}
          <div className="lg:col-span-1">
            {isEnrolling ? (
              <div className="bg-gray-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-purple-300 mb-4">
                  Voice Enrollment
                </h2>

                {enrollmentStep === 'name' && (
                  <div className="space-y-4">
                    <p className="text-gray-400 text-sm">
                      First, enter a name for this voice profile.
                    </p>
                    <input
                      type="text"
                      value={newSpeakerName}
                      onChange={(e) => setNewSpeakerName(e.target.value)}
                      placeholder="Enter name..."
                      className="w-full px-4 py-3 bg-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleCancelEnrollment}
                        className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleNameSubmit}
                        disabled={!newSpeakerName.trim()}
                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {enrollmentStep === 'recording' && (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="text-6xl mb-4 animate-pulse">🎤</div>
                      <p className="text-white font-medium mb-2">
                        Recording {newSpeakerName}&apos;s voice...
                      </p>
                      <p className="text-gray-400 text-sm">
                        {enrollmentState.feedback}
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="bg-gray-700 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300"
                        style={{ width: `${enrollmentState.progress}%` }}
                      />
                    </div>
                    <p className="text-center text-gray-400 text-sm">
                      {Math.round(enrollmentState.progress)}% complete
                    </p>

                    <div className="flex gap-3">
                      <button
                        onClick={handleCancelEnrollment}
                        className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCompleteEnrollment}
                        disabled={enrollmentState.progress < 100}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition"
                      >
                        {enrollmentState.progress >= 100 ? 'Save Voice' : 'Keep Talking...'}
                      </button>
                    </div>
                  </div>
                )}

                {enrollmentStep === 'complete' && (
                  <div className="text-center py-8">
                    <div className="text-6xl mb-4">✅</div>
                    <p className="text-green-400 font-medium">
                      {newSpeakerName}&apos;s voice has been saved!
                    </p>
                    <p className="text-gray-400 text-sm mt-2">
                      Albert will now recognize their voice.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-purple-300 mb-4">
                  How It Works
                </h2>
                <div className="space-y-4 text-sm text-gray-400">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-400 flex-shrink-0">
                      1
                    </div>
                    <p>
                      <span className="text-white font-medium">Enroll your voice</span> by
                      speaking naturally for about 30 seconds
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-400 flex-shrink-0">
                      2
                    </div>
                    <p>
                      <span className="text-white font-medium">Albert creates a voiceprint</span>{' '}
                      - a unique identifier for your voice
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-400 flex-shrink-0">
                      3
                    </div>
                    <p>
                      <span className="text-white font-medium">When you chat</span>, Albert
                      recognizes your voice and personalizes the experience
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-700/50 rounded-lg">
                  <h3 className="text-purple-300 font-medium mb-2">🔒 Privacy First</h3>
                  <p className="text-xs text-gray-400">
                    Voice recognition runs entirely on your device. No audio is ever sent
                    to external servers. Voiceprints are encrypted and stored securely.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PasscodeGate>
  );
}
