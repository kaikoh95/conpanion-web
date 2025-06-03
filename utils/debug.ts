'use client';

import React from 'react';

/**
 * Debug utility for conditionally showing debug UI elements
 * Set NEXT_PUBLIC_DEBUG=true in your environment variables to enable debug mode
 */

export const isDebugMode = (): boolean => {
  return process.env.NEXT_PUBLIC_DEBUG === 'true';
};

/**
 * Hook for React components to check debug mode
 */
export const useDebug = (): boolean => {
  return isDebugMode();
};

/**
 * Debug wrapper component for conditional rendering
 */
interface DebugWrapperProps {
  children: React.ReactNode;
}

export function DebugWrapper({ children }: DebugWrapperProps): React.ReactElement | null {
  if (!isDebugMode()) {
    return null;
  }
  return React.createElement(React.Fragment, null, children);
}
