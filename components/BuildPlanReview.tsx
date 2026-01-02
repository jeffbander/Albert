'use client';

import { useState } from 'react';

// Types from buildPlanner (copied to avoid server import)
export interface BuildPlanStep {
  order: number;
  action: string;
  files: string[];
  reasoning: string;
  estimatedTime?: string;
  status: 'pending' | 'active' | 'complete' | 'skipped' | 'failed';
}

export interface BuildPlan {
  id: string;
  projectId?: string;
  description: string;
  projectType: string;
  steps: BuildPlanStep[];
  estimatedFiles: string[];
  estimatedDependencies: string[];
  techStack: string[];
  risks: string[];
  status: 'draft' | 'approved' | 'executing' | 'complete' | 'failed';
  createdAt: Date;
  approvedAt?: Date;
}

interface BuildPlanReviewProps {
  plan: BuildPlan;
  onApprove: (plan: BuildPlan) => void;
  onModify?: (plan: BuildPlan) => void;
  onCancel?: () => void;
  isExecuting?: boolean;
}

const statusColors: Record<BuildPlanStep['status'], string> = {
  pending: 'bg-gray-600 text-gray-300',
  active: 'bg-blue-600 text-white animate-pulse',
  complete: 'bg-green-600 text-white',
  skipped: 'bg-gray-500 text-gray-300',
  failed: 'bg-red-600 text-white',
};

const statusIcons: Record<BuildPlanStep['status'], React.ReactNode> = {
  pending: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
    </svg>
  ),
  active: (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  complete: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  skipped: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  ),
  failed: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

export default function BuildPlanReview({
  plan,
  onApprove,
  onModify,
  onCancel,
  isExecuting = false,
}: BuildPlanReviewProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [skippedSteps, setSkippedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (order: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(order)) {
        next.delete(order);
      } else {
        next.add(order);
      }
      return next;
    });
  };

  const toggleSkip = (order: number) => {
    if (isExecuting) return;
    setSkippedSteps(prev => {
      const next = new Set(prev);
      if (next.has(order)) {
        next.delete(order);
      } else {
        next.add(order);
      }
      return next;
    });
  };

  const handleApprove = () => {
    const modifiedPlan: BuildPlan = {
      ...plan,
      steps: plan.steps.map(step => ({
        ...step,
        status: skippedSteps.has(step.order) ? 'skipped' : step.status,
      })),
    };
    onApprove(modifiedPlan);
  };

  const completedSteps = plan.steps.filter(s => s.status === 'complete').length;
  const totalSteps = plan.steps.filter(s => s.status !== 'skipped').length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Build Plan</h3>
            <p className="text-sm text-gray-400 mt-0.5">{plan.description}</p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            plan.status === 'draft' ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/50' :
            plan.status === 'approved' ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50' :
            plan.status === 'executing' ? 'bg-purple-600/20 text-purple-400 border border-purple-600/50' :
            plan.status === 'complete' ? 'bg-green-600/20 text-green-400 border border-green-600/50' :
            'bg-red-600/20 text-red-400 border border-red-600/50'
          }`}>
            {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
          </div>
        </div>

        {/* Progress bar for executing plans */}
        {isExecuting && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress</span>
              <span>{completedSteps}/{totalSteps} steps</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tech Stack & Dependencies */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/50">
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-gray-500">Stack: </span>
            <span className="text-gray-300">{plan.techStack.join(', ')}</span>
          </div>
          <div>
            <span className="text-gray-500">Type: </span>
            <span className="text-gray-300">{plan.projectType}</span>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-gray-700/50 max-h-96 overflow-y-auto">
        {plan.steps.map((step) => {
          const isExpanded = expandedSteps.has(step.order);
          const isSkipped = skippedSteps.has(step.order) || step.status === 'skipped';

          return (
            <div
              key={step.order}
              className={`${isSkipped ? 'opacity-50' : ''} transition-opacity`}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-700/30"
                onClick={() => toggleStep(step.order)}
              >
                {/* Status indicator */}
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${statusColors[step.status]}`}>
                  {statusIcons[step.status]}
                </div>

                {/* Step info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">#{step.order}</span>
                    <span className={`text-sm font-medium ${isSkipped ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                      {step.action}
                    </span>
                  </div>
                  {step.files.length > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {step.files.slice(0, 3).join(', ')}
                      {step.files.length > 3 && ` +${step.files.length - 3} more`}
                    </div>
                  )}
                </div>

                {/* Skip toggle (only for draft plans) */}
                {plan.status === 'draft' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSkip(step.order);
                    }}
                    className={`px-2 py-1 text-xs rounded ${
                      isSkipped
                        ? 'bg-gray-600 text-gray-300'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {isSkipped ? 'Skipped' : 'Skip'}
                  </button>
                )}

                {/* Expand indicator */}
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-3 pl-14">
                  <p className="text-sm text-gray-400 mb-2">{step.reasoning}</p>
                  {step.files.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {step.files.map((file, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Risks */}
      {plan.risks.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-700 bg-yellow-900/10">
          <div className="flex items-center gap-2 text-yellow-400 text-sm mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Potential Risks</span>
          </div>
          <ul className="text-sm text-yellow-300/70 space-y-1">
            {plan.risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-yellow-400">•</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {plan.status === 'draft' && (
        <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/80 flex gap-3">
          <button
            onClick={handleApprove}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition"
          >
            Approve & Build
          </button>
          {onModify && (
            <button
              onClick={() => onModify(plan)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
            >
              Modify
            </button>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
