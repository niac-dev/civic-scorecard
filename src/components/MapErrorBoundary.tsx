"use client";

import { Component, type ReactNode } from 'react';

interface MapErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

// Contains any uncaught error thrown while a map component initializes or
// renders (e.g. maplibre-gl's WebGL context creation errors on browsers with
// hardware acceleration disabled) so it can never crash the whole page.
export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Map failed to initialize; contained by MapErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <MapUnavailableNotice />;
    }
    return this.props.children;
  }
}

// Shared fallback shown whenever a map can't be rendered (WebGL unsupported,
// or any other map initialization error). Pass className to match the
// dimensions of whatever map container it's replacing.
export function MapUnavailableNotice({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center text-center p-4 rounded-xl border border-[#E7ECF2] dark:border-slate-700 bg-white dark:bg-[#0B1220] ${className}`}
    >
      <div className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        The interactive map isn&apos;t available in this browser.
      </div>
    </div>
  );
}
