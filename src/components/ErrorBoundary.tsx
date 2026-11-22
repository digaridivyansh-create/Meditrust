import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error) {
    console.error('MediTrust ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let displayMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && parsed.error) {
          displayMsg = `Data operation (${parsed.operationType || 'request'} on ${parsed.path || 'workspace'}): ${parsed.error}`;
        }
      } catch {
        // Plain text error
      }

      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-rose-700 mb-4">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h1 className="text-xl font-semibold text-[#0B1B2B]">Workspace Notice</h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-6 break-words">{displayMsg}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Return to Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
