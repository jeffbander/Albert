'use client';

import React, { useState, useEffect, useRef } from 'react';
import Panel from './Panel';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState, ResearchResult } from '@/types/dashboard';

interface ResearchPanelProps {
  panel: PanelState;
}

export default function ResearchPanel({ panel }: ResearchPanelProps) {
  const { state, addResearchResult, updatePanelData } = useDashboard();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // Get research results for this panel's topic
  const topic = panel.data?.topic as string;
  const sessionId = panel.data?.sessionId as string;
  const results = panel.data?.results as ResearchResult[] || [];

  // Auto-scroll to bottom when new results arrive
  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results]);

  // Handle asking a follow-up question
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ask_question',
          question,
          sessionId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        const newResult: ResearchResult = {
          id: `result-${Date.now()}`,
          topic: question,
          answer: data.answer,
          citations: data.citations || [],
          timestamp: new Date(),
        };

        // Add to panel's local results
        updatePanelData(panel.id, {
          results: [...results, newResult],
        });

        // Also add to global research history
        addResearchResult({
          topic: question,
          answer: data.answer,
          citations: data.citations || [],
        });

        setQuestion('');
      } else {
        setError(data.error || 'Failed to get answer');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Panel
      panel={panel}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      }
      statusIndicator={isLoading ? 'loading' : results.length > 0 ? 'success' : null}
    >
      <div className="flex flex-col h-full">
        {/* Topic header */}
        {topic && (
          <div className="px-4 py-3 bg-purple-500/10 border-b border-gray-700">
            <h3 className="text-sm font-medium text-purple-300">Researching</h3>
            <p className="text-white mt-1">{topic}</p>
          </div>
        )}

        {/* Results area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {results.length === 0 && !isLoading && (
            <div className="text-center text-gray-500 py-8">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p>Ask a question to start researching</p>
            </div>
          )}

          {results.map((result) => (
            <div key={result.id} className="space-y-2">
              {/* Question/Topic */}
              <div className="flex items-start gap-2">
                <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded">Q</span>
                <p className="text-sm text-gray-300">{result.topic}</p>
              </div>

              {/* Answer */}
              <div className="bg-gray-800 rounded-lg p-3 ml-6">
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{result.answer}</p>

                {/* Citations */}
                {result.citations && result.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-500 mb-2">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {result.citations.map((citation, i) => (
                        <a
                          key={i}
                          href={citation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-400 hover:text-purple-300 truncate max-w-[200px]"
                          title={citation}
                        >
                          [{i + 1}] {new URL(citation).hostname}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <p className="text-xs text-gray-600 ml-6">
                {new Date(result.timestamp).toLocaleTimeString()}
              </p>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent" />
              <span className="text-sm text-gray-400">Researching...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div ref={resultsEndRef} />
        </div>

        {/* Question input */}
        <form onSubmit={handleAskQuestion} className="p-3 border-t border-gray-700 bg-gray-800/50">
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a follow-up question..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg transition text-sm font-medium"
            >
              Ask
            </button>
          </div>
        </form>
      </div>
    </Panel>
  );
}
