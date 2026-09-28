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

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

