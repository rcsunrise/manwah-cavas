/**
 * API 渠道与平台动态识别工具 (apiChannel.ts)
 * 动态根据 Base URL 提炼识别对应的服务商名称、图标、色彩与线路特征。
 * 彻底消除硬编码，适应 Supabase 中填写的任何域名（如 TianToken, VectorEngine, RouterHub, SiliconFlow 等）。
 */

export interface ApiChannelInfo {
  key: string;
  name: string;
  shortName: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  dotColor: string;
  iconType: 'sparkles' | 'database' | 'cpu' | 'cloud' | 'server';
  defaultBaseUrl: string;
  isTianToken: boolean;
  isVectorEngine: boolean;
  isRouterHub: boolean;
  description: string;
}

export function detectApiChannel(baseUrl: string | null | undefined): ApiChannelInfo {
  const url = (baseUrl || '').trim().toLowerCase();

  // 1. TianToken (天Token)
  if (url.includes('tiantoken')) {
    return {
      key: 'tiantoken',
      name: 'TianToken (天Token API)',
      shortName: 'TianToken',
      badgeBg: 'bg-amber-500/10',
      badgeText: 'text-amber-700',
      borderColor: 'border-amber-400',
      dotColor: 'bg-amber-500',
      iconType: 'sparkles',
      defaultBaseUrl: 'https://api.tiantoken.com',
      isTianToken: true,
      isVectorEngine: false,
      isRouterHub: false,
      description: 'TianToken 聚合路由 (已兼容 OpenAI/Bailian 视频与生图协议)'
    };
  }

  // 2. VectorEngine (向量引擎)
  if (url.includes('vectorengine')) {
    return {
      key: 'vectorengine',
      name: 'VectorEngine (向量引擎 API)',
      shortName: 'VectorEngine',
      badgeBg: 'bg-purple-500/10',
      badgeText: 'text-purple-700',
      borderColor: 'border-purple-400',
      dotColor: 'bg-purple-500',
      iconType: 'database',
      defaultBaseUrl: 'https://api.vectorengine.ai',
      isTianToken: false,
      isVectorEngine: true,
      isRouterHub: false,
      description: 'VectorEngine 官方节点'
    };
  }

  // 3. RouterHub
  if (url.includes('routerhub')) {
    return {
      key: 'routerhub',
      name: 'RouterHub API',
      shortName: 'RouterHub',
      badgeBg: 'bg-emerald-500/10',
      badgeText: 'text-emerald-700',
      borderColor: 'border-emerald-400',
      dotColor: 'bg-emerald-500',
      iconType: 'server',
      defaultBaseUrl: 'https://api.routerhub.ai',
      isTianToken: false,
      isVectorEngine: false,
      isRouterHub: true,
      description: 'RouterHub 网关节点'
    };
  }

  // 4. SiliconFlow (硅基流动)
  if (url.includes('siliconflow')) {
    return {
      key: 'siliconflow',
      name: 'SiliconFlow (硅基流动)',
      shortName: 'SiliconFlow',
      badgeBg: 'bg-blue-500/10',
      badgeText: 'text-blue-700',
      borderColor: 'border-blue-400',
      dotColor: 'bg-blue-500',
      iconType: 'cpu',
      defaultBaseUrl: 'https://api.siliconflow.cn',
      isTianToken: false,
      isVectorEngine: false,
      isRouterHub: false,
      description: '硅基流动加速节点'
    };
  }

  // 5. 动态自适应未知/私有网关或新域名
  if (url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      const hostname = parsed.hostname;
      // 提取核心域名部分，例如 api.example.com -> Example
      const parts = hostname.split('.');
      const domainCore = parts.length >= 2 ? parts[parts.length - 2] : hostname;
      const formattedName = domainCore.charAt(0).toUpperCase() + domainCore.slice(1);

      return {
        key: domainCore.toLowerCase(),
        name: `${formattedName} (${hostname})`,
        shortName: formattedName,
        badgeBg: 'bg-indigo-500/10',
        badgeText: 'text-indigo-700',
        borderColor: 'border-indigo-400',
        dotColor: 'bg-indigo-500',
        iconType: 'cloud',
        defaultBaseUrl: `https://${hostname}`,
        isTianToken: false,
        isVectorEngine: false,
        isRouterHub: false,
        description: `动态接入点: ${hostname}`
      };
    } catch {
      // url parse error fallback
    }
  }

  // 默认兜底
  return {
    key: 'custom',
    name: '自定义 API 路由',
    shortName: '自定义网关',
    badgeBg: 'bg-stone-500/10',
    badgeText: 'text-stone-700',
    borderColor: 'border-stone-400',
    dotColor: 'bg-stone-500',
    iconType: 'server',
    defaultBaseUrl: '',
    isTianToken: false,
    isVectorEngine: false,
    isRouterHub: false,
    description: '未指定标准网关'
  };
}
