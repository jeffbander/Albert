'use client';

import { useEffect, useState } from 'react';
import type { BuildStatus } from '@/types/build';

interface BuildProgressBarProps {
  progress?: number; // 0-100
  phase: BuildStatus;
  isActive: boolean;
}

const phaseProgress: Record<BuildStatus, number> = {
  queued: 0,
  planning: 15,
  building: 50,
  testing: 75,
  deploying: 90,
  complete: 100,
  failed: 0,
};

export default function BuildProgressBar({ progress, phase, isActive }: BuildProgressBarProps) {
  const [displayProgress, setDisplayProgress] = useState(0);

  // Use explicit progress if provided, otherwise estimate from phase
  const targetProgress = progress ?? phaseProgress[phase] ?? 0;

  // Animate progress changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayProgress(targetProgress);
    }, 100);
    return () => clearTimeout(timer);
  }, [targetProgress]);

  // Determine color based on phase
  const getProgressColor = () => {
    if (phase === 'failed') return 'bg-red-500';
    if (phase === 'complete') return 'bg-green-500';
    return 'bg-purple-600';
  };

  // Show indeterminate animation when building without specific progress
  const isIndeterminate = isActive && progress === undefined && phase === 'building';

  return (
    <div className="w-full">
      <div className="flex justify-between mb-1">
        <span className="text-sm text-gray-400">
          {phase === 'complete' ? 'Complete' : phase === 'failed' ? 'Failed' : 'Progress'}
        </span>
        <span className="text-sm text-gray-400">
          {phase === 'failed' ? '—' : `${Math.round(displayProgress)}%`}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        {isIndeterminate ? (
          <div
            className={`h-full ${getProgressColor()} rounded-full animate-pulse`}
            style={{ width: '100%', opacity: 0.6 }}
          />
        ) : (
          <div
            className={`h-full ${getProgressColor()} rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${displayProgress}%` }}
          />
        )}
      </div>
    </div>
  );
}
