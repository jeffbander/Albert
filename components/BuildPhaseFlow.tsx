'use client';

import type { BuildStatus } from '@/types/build';

interface BuildPhaseFlowProps {
  currentPhase: BuildStatus;
}

const phases: { key: BuildStatus; label: string }[] = [
  { key: 'planning', label: 'Planning' },
  { key: 'building', label: 'Building' },
  { key: 'testing', label: 'Testing' },
  { key: 'deploying', label: 'Deploying' },
  { key: 'complete', label: 'Complete' },
];

const phaseOrder: Record<BuildStatus, number> = {
  queued: -1,
  planning: 0,
  building: 1,
  testing: 2,
  deploying: 3,
  complete: 4,
  failed: -1,
  cancelled: -1,
};

export default function BuildPhaseFlow({ currentPhase }: BuildPhaseFlowProps) {
  const currentIndex = phaseOrder[currentPhase];
  const isFailed = currentPhase === 'failed';

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {phases.map((phase, index) => {
          const isCompleted = currentIndex > index;
          const isCurrent = currentIndex === index;
          const isUpcoming = currentIndex < index;
          const isFailedPhase = isFailed && index === 0; // Show failure at first phase for visibility

          return (
            <div key={phase.key} className="flex items-center flex-1">
              {/* Phase circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                    transition-all duration-300
                    ${isCompleted ? 'bg-green-500 text-white' : ''}
                    ${isCurrent && !isFailed ? 'bg-purple-600 text-white ring-4 ring-purple-600/30' : ''}
                    ${isCurrent && isFailed ? 'bg-red-500 text-white ring-4 ring-red-500/30' : ''}
                    ${isUpcoming ? 'bg-gray-700 text-gray-400' : ''}
                    ${isFailedPhase ? 'bg-red-500 text-white' : ''}
                  `}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isFailed && (isCurrent || isFailedPhase) ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`
                    mt-2 text-xs font-medium
                    ${isCompleted ? 'text-green-400' : ''}
                    ${isCurrent && !isFailed ? 'text-purple-400' : ''}
                    ${isCurrent && isFailed ? 'text-red-400' : ''}
                    ${isUpcoming ? 'text-gray-500' : ''}
                  `}
                >
                  {phase.label}
                </span>
              </div>

              {/* Connector line */}
              {index < phases.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-2 transition-all duration-300
                    ${currentIndex > index ? 'bg-green-500' : 'bg-gray-700'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
