import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'حدث خطأ غير متوقع' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-emerald-50/40 dark:bg-slate-950 flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-emerald-100 dark:border-slate-800 shadow-sm text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 mx-auto flex items-center justify-center">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              عذراً، حدث خطأ في التشغيل
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
