import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'Ralat tidak dijangka telah berlaku.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.error) {
        readable = `Sekatan Akses atau Pangkalan Data (${parsed.operationType || 'operasi'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
            <div className="w-12 h-12 rounded-lg bg-red-50 text-red-700 flex items-center justify-center mb-5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[#0B1F3B] mb-2">
              Gangguan Sistem Dikesan
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3B] text-white text-sm font-medium rounded-lg hover:bg-[#14325C] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Semula Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
