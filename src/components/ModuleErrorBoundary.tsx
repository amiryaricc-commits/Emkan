import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  moduleName?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ModuleErrorBoundary: ${this.props.moduleName || 'Unknown'}]`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 m-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-900 dark:text-rose-100 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold">
              خطایی در اجرای ماژول «{this.props.moduleName || 'سیستم'}» رخ داد
            </h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md font-mono">
              {this.state.error?.message || 'خطای غیرمنتظره در رندرینگ کامپوننت'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <RefreshCw className="w-4 h-4" />
            <span>تلاش مجدد و بارگذاری ماژول</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
