'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ExtensionPage() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);

    // Trigger download of the extension zip
    const link = document.createElement('a');
    link.href = '/albert-extension.zip';
    link.download = 'albert-extension.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Header */}
      <header className="p-6 flex justify-between items-center">
        <Link href="/" className="text-2xl font-light text-gray-300 tracking-wider hover:text-white transition-colors">
          Albert
        </Link>
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-green-400 transition-colors"
        >
          Back to App
        </Link>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold mb-4">Albert Chrome Extension</h1>
          <p className="text-xl text-gray-400">
            Access Albert from any webpage with voice commands and page context
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Voice Anywhere</h3>
            <p className="text-gray-400 text-sm">
              Click the floating orb or press Ctrl+Shift+V to talk to Albert on any page
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Page Context</h3>
            <p className="text-gray-400 text-sm">
              Send the current page content to Albert for summarization and Q&A
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Quick Access</h3>
            <p className="text-gray-400 text-sm">
              Use keyboard shortcuts to quickly open Albert without leaving your workflow
            </p>
          </div>
        </div>

        {/* Download Button */}
        <div className="text-center mb-12">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-orange-500 to-amber-600 rounded-xl text-lg font-semibold hover:from-orange-400 hover:to-amber-500 transition-all transform hover:scale-105 disabled:opacity-50 disabled:transform-none"
          >
            {downloading ? (
              <>
                <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Downloading...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Extension
              </>
            )}
          </button>
        </div>

        {/* Installation Steps */}
        <div className="bg-gray-800/30 rounded-xl p-8 border border-gray-700">
          <h2 className="text-2xl font-semibold mb-6">Installation Guide</h2>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">Download & Extract</h3>
                <p className="text-gray-400">
                  Click the download button above and extract the ZIP file to a folder on your computer
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">Open Chrome Extensions</h3>
                <p className="text-gray-400">
                  Navigate to <code className="bg-gray-700 px-2 py-1 rounded text-sm">chrome://extensions</code> in your browser
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">Enable Developer Mode</h3>
                <p className="text-gray-400">
                  Toggle the &quot;Developer mode&quot; switch in the top-right corner of the extensions page
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold">
                4
              </div>
              <div>
                <h3 className="font-semibold mb-1">Load the Extension</h3>
                <p className="text-gray-400">
                  Click &quot;Load unpacked&quot; and select the extracted extension folder
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-sm font-bold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Ready to Go!</h3>
                <p className="text-gray-400">
                  The Albert orb will appear on every webpage. Click it or press <kbd className="bg-gray-700 px-2 py-1 rounded text-sm">Ctrl+Shift+V</kbd> to start talking
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="mt-8 bg-gray-800/30 rounded-xl p-8 border border-gray-700">
          <h2 className="text-2xl font-semibold mb-6">Keyboard Shortcuts</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <span className="text-gray-300">Open Extension Popup</span>
              <kbd className="bg-gray-700 px-3 py-1.5 rounded text-sm font-mono">Ctrl+Shift+A</kbd>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <span className="text-gray-300">Start Voice (Any Page)</span>
              <kbd className="bg-gray-700 px-3 py-1.5 rounded text-sm font-mono">Ctrl+Shift+V</kbd>
            </div>
          </div>

          <p className="text-gray-500 text-sm mt-4">
            On macOS, use <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">Cmd</kbd> instead of <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">Ctrl</kbd>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-8 text-gray-500 text-sm">
        <p>Albert by Bander Labs</p>
      </footer>
    </main>
  );
}
