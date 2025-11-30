'use client';

import { useState, useEffect } from 'react';

interface PasscodeGateProps {
  children: React.ReactNode;
}

const PASSCODE = '12132010';
const COOKIE_NAME = 'albert_auth';
const COOKIE_EXPIRY_DAYS = 30;

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name: string): string | null {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

export default function PasscodeGate({ children }: PasscodeGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    // Check if already authenticated via cookie
    const authCookie = getCookie(COOKIE_NAME);
    setIsAuthenticated(authCookie === 'true');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (passcode === PASSCODE) {
      setCookie(COOKIE_NAME, 'true', COOKIE_EXPIRY_DAYS);
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect passcode');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setPasscode('');
    }
  };

  // Loading state while checking cookie
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gradient-animated flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-animated flex flex-col items-center justify-center p-4">
        {/* Header */}
        <div className="absolute top-8 left-8">
          <h1 className="text-2xl font-light text-gray-300 tracking-wider">Albert</h1>
          <p className="text-xs text-gray-500 mt-1">by Bander Labs</p>
        </div>

        {/* Login Form */}
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center">
              <svg className="w-10 h-10 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Enter passcode to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className={`transition-transform ${isShaking ? 'animate-shake' : ''}`}>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-center text-lg tracking-widest"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium"
            >
              Enter
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="absolute bottom-4 text-center">
          <p className="text-xs text-gray-600">
            Created by <span className="text-purple-400">Bander Labs</span>
          </p>
        </div>

        <style jsx>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
          }
          .animate-shake {
            animation: shake 0.5s ease-in-out;
          }
        `}</style>
      </div>
    );
  }

  // Authenticated - show children
  return <>{children}</>;
}
