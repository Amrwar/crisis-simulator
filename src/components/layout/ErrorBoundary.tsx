'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Stops one broken panel taking the whole page down.
 *
 * The analytics and comparison pages render charts from data the server
 * computed; a single unexpected shape used to blank the route. Wrapping each
 * panel means the rest of the page still renders and the reader is told which
 * part failed.
 *
 * React only supports error boundaries as class components, which is why this
 * is the one class in the codebase.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Named in the fallback, so the reader knows what is missing. */
  label?: string;
  /** Rendered instead of the default fallback. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept to the server-side log; the reader gets the fallback, not a stack.
    console.error('[render]', this.props.label ?? 'panel', error, info.componentStack);
  }

  /** Lets a parent clear the failure — after a retry, say. */
  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="glass-panel p-6 border-accent-red/40 text-center" role="alert">
        <div className="text-3xl mb-2" aria-hidden="true">
          ⚠️
        </div>
        <p className="text-accent-red font-medium mb-1">
          {this.props.label ? `${this.props.label} could not be shown` : 'This panel could not be shown'}
        </p>
        <p className="text-text-secondary text-sm mb-4">
          The rest of the page is unaffected.
        </p>
        <button type="button" onClick={this.reset} className="btn-ghost text-sm">
          Try again
        </button>
      </div>
    );
  }
}
