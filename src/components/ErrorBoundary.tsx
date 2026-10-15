import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getFriendlyErrorMessage } from '../services/firebase';
import { InstitutionalLockup } from './BrandIdentity';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: getFriendlyErrorMessage(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SIGCO ErrorBoundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-xs">
            <div className="flex justify-center">
              <InstitutionalLockup size="sm" />
            </div>
            <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
            <h2 className="text-lg font-bold text-[#003366]">Atenção</h2>
            <p className="text-xs text-[#64748B] leading-relaxed">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="px-4 py-2 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Recarregar Sistema
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
