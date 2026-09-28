import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCw, Home, AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RouteErrorBoundary] Caught error:', error, errorInfo);
  }

  private handleRetry = () => {
    try {
      // 清除可能缓存的懒加载重试锁
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('lazy_retry_')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch {}
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const isImportError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.name === 'TypeError';

      return (
        <div className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center p-6">
          <div className="bg-stone-800/90 border border-stone-700/80 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl space-y-5">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-stone-100">
                {isImportError ? '页面组件加载中断' : (this.props.fallbackTitle || '页面运行出现异常')}
              </h2>
              <p className="text-sm text-stone-400 leading-relaxed">
                {isImportError
                  ? '服务正在更新或网络发生短暂波动，导致动态模块未能及时载入。请尝试刷新或重新进入。'
                  : (this.state.error?.message || '发生了未预期的渲染错误。')}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm flex items-center gap-2 transition shadow-lg shadow-amber-500/20"
              >
                <RotateCw className="w-4 h-4" />
                重新加载
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-5 py-2.5 rounded-xl bg-stone-700/80 hover:bg-stone-600 text-stone-200 font-medium text-sm flex items-center gap-2 transition"
              >
                <Home className="w-4 h-4" />
                返回主页
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
