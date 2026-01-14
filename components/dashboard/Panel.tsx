'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import type { PanelState } from '@/types/dashboard';

interface PanelProps {
  panel: PanelState;
  children: React.ReactNode;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  statusIndicator?: 'active' | 'loading' | 'success' | 'error' | null;
}

export default function Panel({
  panel,
  children,
  icon,
  headerActions,
  statusIndicator,
}: PanelProps) {
  const { closePanel, minimizePanel, focusPanel, movePanel, resizePanel } = useDashboard();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-controls')) return;

    setIsDragging(true);
    focusPanel(panel.id);
    dragOffset.current = {
      x: e.clientX - panel.position.x,
      y: e.clientY - panel.position.y,
    };
  }, [focusPanel, panel.id, panel.position]);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - panel.size.width, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - panel.size.height, e.clientY - dragOffset.current.y));
      movePanel(panel.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, movePanel, panel.id, panel.size]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    focusPanel(panel.id);
  }, [focusPanel, panel.id]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(300, e.clientX - panel.position.x);
      const newHeight = Math.max(200, e.clientY - panel.position.y);
      resizePanel(panel.id, { width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizePanel, panel.id, panel.position]);

  // Status indicator colors
  const statusColors = {
    active: 'bg-blue-400 animate-pulse',
    loading: 'bg-yellow-400 animate-pulse',
    success: 'bg-green-400',
    error: 'bg-red-400',
  };

  if (panel.isMinimized) {
    return null; // Minimized panels are rendered in the dock
  }

  return (
    <div
      ref={panelRef}
      className="fixed bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: panel.position.x,
        top: panel.position.y,
        width: panel.size.width,
        height: panel.size.height,
        zIndex: panel.zIndex,
      }}
      onClick={() => focusPanel(panel.id)}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          {statusIndicator && (
            <span className={`w-2 h-2 rounded-full ${statusColors[statusIndicator]}`} />
          )}
          {icon && <span className="text-gray-400">{icon}</span>}
          <span className="text-sm font-medium text-gray-200">{panel.title}</span>
        </div>

        <div className="flex items-center gap-1 panel-controls">
          {headerActions}
          <button
            onClick={() => minimizePanel(panel.id)}
            className="p-1 text-gray-400 hover:text-yellow-400 hover:bg-gray-700 rounded transition"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={() => closePanel(panel.id)}
            className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeStart}
      >
        <svg
          className="w-4 h-4 text-gray-600"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M22 22H20V20H22V22ZM22 18H18V22H22V18ZM18 22H14V18H18V22Z" />
        </svg>
      </div>
    </div>
  );
}
