'use client';

import { useEffect, useRef } from 'react';

export type EchoState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface EchoOrbProps {
  state: EchoState;
  onClick: () => void;
  isConnected: boolean;
}

export default function EchoOrb({ state, onClick, isConnected }: EchoOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;

    let time = 0;

    const animate = () => {
      time += 0.02;
      ctx.clearRect(0, 0, size, size);

      const centerX = size / 2;
      const centerY = size / 2;
      const baseRadius = 100;

      // Draw ripple effects for speaking state
      if (state === 'speaking') {
        for (let i = 0; i < 3; i++) {
          const rippleProgress = ((time * 0.5 + i * 0.33) % 1);
          const rippleRadius = baseRadius + rippleProgress * 50;
          const rippleAlpha = (1 - rippleProgress) * 0.3;

          ctx.beginPath();
          ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(99, 102, 241, ${rippleAlpha})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Draw outer glow
      const glowRadius = baseRadius + 20;
      const gradient = ctx.createRadialGradient(
        centerX, centerY, baseRadius * 0.5,
        centerX, centerY, glowRadius
      );

      if (state === 'idle') {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
        gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
      } else if (state === 'listening') {
        const pulse = Math.sin(time * 3) * 0.2 + 0.6;
        gradient.addColorStop(0, `rgba(34, 197, 94, ${pulse})`);
        gradient.addColorStop(0.5, `rgba(34, 197, 94, ${pulse * 0.5})`);
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
      } else if (state === 'thinking') {
        const pulse = Math.sin(time * 5) * 0.3 + 0.5;
        gradient.addColorStop(0, `rgba(251, 191, 36, ${pulse})`);
        gradient.addColorStop(0.5, `rgba(251, 191, 36, ${pulse * 0.5})`);
        gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
      } else if (state === 'speaking') {
        const pulse = Math.sin(time * 4) * 0.2 + 0.7;
        gradient.addColorStop(0, `rgba(99, 102, 241, ${pulse})`);
        gradient.addColorStop(0.5, `rgba(139, 92, 246, ${pulse * 0.6})`);
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
      }

      ctx.beginPath();
      ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw main orb with dynamic shape for speaking
      ctx.beginPath();
      if (state === 'speaking') {
        // Wavy circle for speaking
        for (let angle = 0; angle <= Math.PI * 2; angle += 0.05) {
          const wave = Math.sin(angle * 6 + time * 4) * 8;
          const r = baseRadius + wave;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (angle === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
      } else {
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      }

      const orbGradient = ctx.createRadialGradient(
        centerX - 30, centerY - 30, 0,
        centerX, centerY, baseRadius
      );

      if (state === 'idle') {
        orbGradient.addColorStop(0, '#818cf8');
        orbGradient.addColorStop(0.5, '#6366f1');
        orbGradient.addColorStop(1, '#4f46e5');
      } else if (state === 'listening') {
        orbGradient.addColorStop(0, '#4ade80');
        orbGradient.addColorStop(0.5, '#22c55e');
        orbGradient.addColorStop(1, '#16a34a');
      } else if (state === 'thinking') {
        orbGradient.addColorStop(0, '#fcd34d');
        orbGradient.addColorStop(0.5, '#fbbf24');
        orbGradient.addColorStop(1, '#f59e0b');
      } else if (state === 'speaking') {
        orbGradient.addColorStop(0, '#a78bfa');
        orbGradient.addColorStop(0.5, '#8b5cf6');
        orbGradient.addColorStop(1, '#7c3aed');
      }

      ctx.fillStyle = orbGradient;
      ctx.fill();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(centerX - 25, centerY - 25, 30, 0, Math.PI * 2);
      const highlightGradient = ctx.createRadialGradient(
        centerX - 25, centerY - 25, 0,
        centerX - 25, centerY - 25, 30
      );
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = highlightGradient;
      ctx.fill();

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state]);

  const getStateLabel = () => {
    if (!isConnected) return 'Click to start';
    switch (state) {
      case 'idle': return 'Ready';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <button
        onClick={onClick}
        className="relative cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 rounded-full"
        aria-label={isConnected ? 'Stop conversation' : 'Start conversation'}
      >
        <canvas
          ref={canvasRef}
          className="w-[300px] h-[300px]"
        />
      </button>
      <p className="text-gray-400 text-lg font-light tracking-wide">
        {getStateLabel()}
      </p>
    </div>
  );
}
