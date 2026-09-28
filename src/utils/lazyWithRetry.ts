import React, { lazy } from 'react';

/**
 * 包装 React.lazy，支持网络短暂抖动、服务重启或 Vite 模块缓存更新时自动恢复
 * 在动态 chunk 拉取失败时，尝试重新获取或自动刷新页面以同步最新的资源清单
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  name = 'LazyComponent'
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `lazy_retry_${name}`;
    let attempts = 0;

    while (attempts < 2) {
      try {
        const component = await factory();
        // 加载成功后清除重试标记
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        return component;
      } catch (error: any) {
        attempts++;
        const isFetchError =
          error?.message?.includes('Failed to fetch dynamically imported module') ||
          error?.message?.includes('dynamically imported module') ||
          error?.name === 'TypeError';

        if (isFetchError) {
          // 检查是否已经在短时间内自动刷新过
          let lastReload = 0;
          try {
            lastReload = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
          } catch {}

          const now = Date.now();
          // 若 15 秒内未曾因该模块刷新过，则触发一次刷新以同步 Vite / 生产构建最新清单
          if (typeof window !== 'undefined' && (!lastReload || now - lastReload > 15000)) {
            try {
              sessionStorage.setItem(storageKey, String(now));
            } catch {}
            console.warn(`[lazyWithRetry] Stale module detected for ${name}, auto-refreshing page...`);
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }

          console.warn(`[lazyWithRetry] Retrying dynamic import for ${name} (attempt ${attempts}/2)...`);
          await new Promise((resolve) => setTimeout(resolve, attempts * 500));
          continue;
        }

        console.error(`[lazyWithRetry] Failed to load module ${name}:`, error);
        throw error;
      }
    }

    // 终极尝试，失败将由 RouteErrorBoundary 捕获
    try {
      const comp = await factory();
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      return comp;
    } catch (finalError) {
      console.error(`[lazyWithRetry] Final attempt failed for ${name}:`, finalError);
      throw finalError;
    }
  });
}

