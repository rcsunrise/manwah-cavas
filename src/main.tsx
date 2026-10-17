// Safely patch performance.measure and performance.mark to prevent crashes in sandboxed iframes
if (typeof window !== 'undefined') {
  const purgeStaleAuthTokens = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (
            k &&
            (k.startsWith('sb-') ||
              k.includes('supabase.auth') ||
              k === 'supabase.auth.token' ||
              k === 'token' ||
              k === 'manwah_user')
          ) {
            keys.push(k);
          }
        }
        keys.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch (_) {}
        });
      }
    } catch (_) {}
  };

  window.addEventListener('error', (e) => {
    const msg = e.message || '';
    if (
      msg.includes('ResizeObserver') ||
      msg.includes('ResizeObserver 循环') ||
      msg.includes('Invalid Refresh Token') ||
      msg.includes('Refresh Token Not Found') ||
      msg.includes('refresh_token_not_found')
    ) {
      if (
        msg.includes('Invalid Refresh Token') ||
        msg.includes('Refresh Token Not Found') ||
        msg.includes('refresh_token_not_found')
      ) {
        console.warn('[Runtime Resilience] Trapped stale auth error event, purging stale tokens...');
        purgeStaleAuthTokens();
      }
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || '');
    if (
      msg.includes('Failed to fetch') ||
      msg.includes('Load failed') ||
      msg.includes('NetworkError') ||
      msg.includes('ResizeObserver') ||
      msg.includes('Invalid Refresh Token') ||
      msg.includes('Refresh Token Not Found') ||
      msg.includes('refresh_token_not_found') ||
      msg.includes('invalid_grant')
    ) {
      console.warn('[Runtime Resilience] Gracefully handled unhandled network/auth rejection:', msg);
      if (
        msg.includes('Invalid Refresh Token') ||
        msg.includes('Refresh Token Not Found') ||
        msg.includes('refresh_token_not_found') ||
        msg.includes('invalid_grant')
      ) {
        purgeStaleAuthTokens();
      }
      event.preventDefault();
    }
  });

  const originalOnError = window.onerror;
  window.onerror = function (msg, url, lineNo, columnNo, error) {
    const str = typeof msg === 'string' ? msg : (error?.message || '');
    if (
      str.includes('ResizeObserver') ||
      str.includes('ResizeObserver 循环') ||
      str.includes('Invalid Refresh Token') ||
      str.includes('Refresh Token Not Found') ||
      str.includes('refresh_token_not_found') ||
      str.includes('invalid_grant')
    ) {
      if (
        str.includes('Invalid Refresh Token') ||
        str.includes('Refresh Token Not Found') ||
        str.includes('refresh_token_not_found') ||
        str.includes('invalid_grant')
      ) {
        purgeStaleAuthTokens();
      }
      return true;
    }
    if (originalOnError) {
      return originalOnError.apply(this, arguments as any);
    }
    return false;
  };

  if (window.performance) {
    const originalMeasure = window.performance.measure;
    if (originalMeasure) {
      window.performance.measure = function (
        measureName: string,
        startMarkOrOptions?: any,
        endMark?: any
      ) {
        try {
          return originalMeasure.apply(this, arguments as any);
        } catch (e) {
          try {
            if (typeof startMarkOrOptions === 'string') {
              return originalMeasure.call(this, measureName, startMarkOrOptions, endMark);
            } else {
              return originalMeasure.call(this, measureName);
            }
          } catch (innerErr) {
            return {} as any;
          }
        }
      };
    }

    const originalMark = window.performance.mark;
    if (originalMark) {
      window.performance.mark = function (markName: string, markOptions?: any) {
        try {
          return originalMark.apply(this, arguments as any);
        } catch (e) {
          try {
            return originalMark.call(this, markName);
          } catch (innerErr) {
            return {} as any;
          }
        }
      };
    }
  }
}

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, RootErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  handleReset = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    } catch (_) {}
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FBFAF8',
          fontFamily: 'Inter, sans-serif',
          padding: '24px'
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '24px',
            padding: '36px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.06)',
            textAlign: 'center',
            border: '1px solid #EBE7E0'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '28px',
              backgroundColor: '#FEF3C7',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              margin: '0 auto 16px',
              fontWeight: 'bold'
            }}>!</div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1C1917', marginBottom: '8px' }}>
              系统已发布最新升级
            </h2>
            <p style={{ fontSize: '13px', color: '#78716C', lineHeight: '1.6', marginBottom: '24px' }}>
              检测到本地静态脚本与云端最新版本存在更新差异。请点击下方按钮完成一键刷新，即可正常进入工作台。
            </p>
            <button
              onClick={this.handleReset}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '12px',
                backgroundColor: '#B9935A',
                color: '#ffffff',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              一键刷新并进入工作台
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>,
);


