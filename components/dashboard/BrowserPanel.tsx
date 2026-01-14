'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Panel from './Panel';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState } from '@/types/dashboard';

interface BrowserPanelProps {
  panel: PanelState;
}

export default function BrowserPanel({ panel }: BrowserPanelProps) {
  const { updatePanelData, updateBrowserSnapshot } = useDashboard();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');

  const url = panel.data?.url as string;
  const title = panel.data?.title as string;
  const screenshot = panel.data?.screenshot as string;
  const pageText = panel.data?.pageText as string;
  const showText = panel.data?.showText as boolean;

  // Refresh screenshot periodically when browsing
  useEffect(() => {
    if (!url) return;

    const refreshScreenshot = async () => {
      try {
        const response = await fetch('/api/browser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'screenshot' }),
        });
        const data = await response.json();
        if (data.success && data.screenshot) {
          updatePanelData(panel.id, {
            screenshot: data.screenshot,
            title: data.title,
            url: data.url,
          });
          updateBrowserSnapshot({
            url: data.url,
            title: data.title,
            screenshot: data.screenshot,
          });
        }
      } catch (err) {
        console.error('Screenshot refresh failed:', err);
      }
    };

    // Initial screenshot
    if (!screenshot) {
      refreshScreenshot();
    }

    // Refresh every 10 seconds while panel is open
    const interval = setInterval(refreshScreenshot, 10000);
    return () => clearInterval(interval);
  }, [url, panel.id, updatePanelData, updateBrowserSnapshot, screenshot]);

  // Navigate to URL
  const handleNavigate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', url: urlInput }),
      });

      const data = await response.json();
      if (data.success) {
        updatePanelData(panel.id, {
          url: data.url,
          title: data.title,
          screenshot: data.screenshot,
        });
        updateBrowserSnapshot({
          url: data.url,
          title: data.title,
          screenshot: data.screenshot,
        });
        setUrlInput('');
      } else {
        setError(data.error || 'Navigation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Navigation failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Get page text
  const handleGetText = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_text' }),
      });
      const data = await response.json();
      if (data.success) {
        updatePanelData(panel.id, {
          pageText: data.text,
          showText: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get text');
    } finally {
      setIsLoading(false);
    }
  };

  // Take fresh screenshot
  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'screenshot' }),
      });
      const data = await response.json();
      if (data.success) {
        updatePanelData(panel.id, {
          screenshot: data.screenshot,
          title: data.title,
          url: data.url,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Panel
      panel={panel}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      }
      statusIndicator={isLoading ? 'loading' : url ? 'active' : null}
      headerActions={
        <div className="flex items-center gap-1 mr-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition"
            title="Refresh screenshot"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleGetText}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-green-400 hover:bg-gray-700 rounded transition"
            title="Extract page text"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* URL bar */}
        <form onSubmit={handleNavigate} className="p-2 border-b border-gray-700 bg-gray-800/50">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-gray-700 border border-gray-600 rounded-lg overflow-hidden focus-within:border-blue-500">
              <span className="px-2 text-gray-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </span>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={url || 'Enter URL...'}
                className="flex-1 bg-transparent py-1.5 px-1 text-sm text-white placeholder-gray-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !urlInput.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition text-sm"
            >
              Go
            </button>
          </div>
        </form>

        {/* Current page info */}
        {url && (
          <div className="px-3 py-2 bg-gray-800/30 border-b border-gray-700 text-xs">
            <p className="text-gray-300 truncate">{title || 'Loading...'}</p>
            <p className="text-gray-500 truncate">{url}</p>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto bg-gray-950">
          {error && (
            <div className="p-3 m-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {showText && pageText ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-300">Page Content</h4>
                <button
                  onClick={() => updatePanelData(panel.id, { showText: false })}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Show screenshot
                </button>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {pageText}
              </div>
            </div>
          ) : screenshot ? (
            <div className="p-3">
              <img
                src={`data:image/png;base64,${screenshot}`}
                alt="Browser screenshot"
                className="w-full rounded-lg border border-gray-700"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <p className="text-sm">Enter a URL to browse</p>
                <p className="text-xs text-gray-600 mt-1">or say "Go to [website]"</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
