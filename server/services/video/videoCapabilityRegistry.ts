// server/services/video/videoCapabilityRegistry.ts
import { VideoCapability, VideoSettings } from '../../../src/types/creativeCanvasVideo';

/**
 * 严格同步 api.tiantoken.com/pricing 与 tokenmarket.apifox.cn 实测有效上架的视频模型列表
 * 仅保留平台真实有效在售的 7 款模型：
 * 1. 豆包系列 (4个): sd-2.0-fast (默认推荐), sd-2.5, sd-2.0, sd-2.0-mini
 * 2. 万相系列 (1个): wan3.0-video (All-in-One 视频生成模型)
 * 3. xAI系列 (1个): grok-imagine-video-1.5-preview
 * 4. MiniMax海螺 (1个): MiniMax-H3 (Hailuo-03 全模态视频模型)
 */
export const VIDEO_CAPABILITY_REGISTRY: Record<string, VideoCapability> = {
  'sd-2.0-fast': {
    key: 'sd-2.0-fast',
    displayName: '豆包 Seedance 2.0 Fast (稳定在线 · 推荐极速)',
    exactModelId: 'sd-2.0-fast',
    enabled: true,
    tested: true,
    modes: ['image_to_video'],
    variants: [
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '480p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      }
    ],
    supportsCancel: true,
    supportsIdempotency: true,
    supportsLookupByClientKey: true,
    evidenceUrl: 'https://api.tiantoken.com/pricing',
    verifiedAt: '2026-09-21'
  },
  'sd-2.0': {
    key: 'sd-2.0',
    displayName: '豆包 Seedance 2.0 (稳定在线 · 高画质旗舰)',
    exactModelId: 'sd-2.0',
    enabled: true,
    tested: true,
    modes: ['image_to_video'],
    variants: [
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      }
    ],
    supportsCancel: true,
    supportsIdempotency: true,
    supportsLookupByClientKey: true,
    evidenceUrl: 'https://api.tiantoken.com/pricing',
    verifiedAt: '2026-09-21'
  },
  'sd-2.0-mini': {
    key: 'sd-2.0-mini',
    displayName: '豆包 Seedance 2.0 Mini (稳定在线 · 高性价比轻量)',
    exactModelId: 'sd-2.0-mini',
    enabled: true,
    tested: true,
    modes: ['image_to_video'],
    variants: [
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '480p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      }
    ],
    supportsCancel: true,
    supportsIdempotency: true,
    supportsLookupByClientKey: true,
    evidenceUrl: 'https://api.tiantoken.com/pricing',
    verifiedAt: '2026-09-21'
  },
  'sd-2.5': {
    key: 'sd-2.5',
    displayName: '豆包 Seedance 2.5 (稳定在线 · 专业版)',
    exactModelId: 'sd-2.5',
    enabled: true,
    tested: true,
    modes: ['image_to_video'],
    variants: [
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        maxImages: 1,
        audioModes: ['none']
      }
    ],
    supportsCancel: true,
    supportsIdempotency: true,
    supportsLookupByClientKey: true,
    evidenceUrl: 'https://api.tiantoken.com/pricing',
    verifiedAt: '2026-09-21'
  },
  'wan3.0-video': {
    key: 'wan3.0-video',
    displayName: '通义万相 3.0 (需开通国内模型分组)',
    exactModelId: 'wan3.0-video',
    enabled: true,
    tested: false,
    modes: ['image_to_video'],
    variants: [
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      }
    ],
    supportsCancel: false,
    supportsIdempotency: false,
    supportsLookupByClientKey: false,
    evidenceUrl: 'https://api.tiantoken.com/pricing',
    verifiedAt: '2026-09-21'
  },
  'grok-imagine-video-1.5-preview': {
    key: 'grok-imagine-video-1.5-preview',
    displayName: 'xAI Grok Imagine Video 1.5 (需开通优质grok分组)',
    exactModelId: 'grok-imagine-video-1.5-preview',
    enabled: true,
    tested: false,
    modes: ['image_to_video'],
    variants: [
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 5,
        resolution: '480p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      }
    ],
    supportsCancel: true,
    supportsIdempotency: true,
    supportsLookupByClientKey: false,
    evidenceUrl: 'https://api.tiantoken.com/pricing',
    verifiedAt: '2026-09-21'
  },
  'MiniMax-H3': {
    key: 'MiniMax-H3',
    displayName: 'MiniMax-H3 海螺03 (上游渠道维护中)',
    exactModelId: 'MiniMax-H3',
    enabled: true,
    tested: false,
    modes: ['image_to_video'],
    variants: [
      {
        mode: 'image_to_video',
        durationSeconds: 6,
        resolution: '1080p', // 对应平台2K标度
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '1080p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 6,
        resolution: '720p', // 对应平台768P标度
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      },
      {
        mode: 'image_to_video',
        durationSeconds: 10,
        resolution: '720p',
        ratios: ['16:9', '9:16', '1:1'],
        maxImages: 1,
        audioModes: ['none']
      }
    ],
    supportsCancel: true,
    supportsIdempotency: true,
    supportsLookupByClientKey: false,
    evidenceUrl: 'https://api.tiantoken.com/pricing',
    verifiedAt: '2026-09-21'
  }
};

/**
 * 历史模型别名自动映射表，确保老节点/旧参数能够平滑兼容升级到对应在售模型
 */
const MODEL_KEY_ALIASES: Record<string, string> = {
  // 万相系列
  'wan2.6-i2v': 'wan3.0-video',
  'wan2.6-i2v-flash': 'wan3.0-video',
  'wan3.0': 'wan3.0-video',
  // 豆包/Seedance 系列
  'doubao-seedance-1-0-pro-fast': 'sd-2.0-fast',
  'doubao-seedance-1-0-pro-fast-251015': 'sd-2.0-fast',
  'doubao-seedance-1-5-pro': 'sd-2.5',
  'doubao-seedance-1-5-pro-251215': 'sd-2.5',
  'seedance-2.0': 'sd-2.0',
  'seedance-2.0-fast': 'sd-2.0-fast',
  // MiniMax 系列
  'minimax-video-01': 'MiniMax-H3',
  'video-01': 'MiniMax-H3',
  'minimax-video-01-live': 'MiniMax-H3',
  'video-01-live': 'MiniMax-H3',
  'minimax-video-01-director': 'MiniMax-H3',
  'video-01-director': 'MiniMax-H3',
  'minimax-h3': 'MiniMax-H3',
  // 可灵及其他兼容映射
  'kling-v1': 'sd-2.0-fast',
  'kling-v1-5': 'sd-2.0-fast',
  'kling-v1-6': 'sd-2.5',
  'kling-v2-0': 'sd-2.5',
  'luma-dream-machine': 'sd-2.5',
  'dream-machine': 'sd-2.5',
  'sora-2': 'sd-2.5'
};

export function getAvailableVideoCapabilities(): VideoCapability[] {
  return Object.values(VIDEO_CAPABILITY_REGISTRY).filter(c => c.enabled);
}

export function resolveVideoCapability(modelKey?: string): VideoCapability {
  const defaultKey = process.env.VIDEO_DEFAULT_MODEL_KEY || 'sd-2.0-fast';
  
  if (modelKey) {
    if (VIDEO_CAPABILITY_REGISTRY[modelKey]) {
      return VIDEO_CAPABILITY_REGISTRY[modelKey];
    }
    const mappedKey = MODEL_KEY_ALIASES[modelKey];
    if (mappedKey && VIDEO_CAPABILITY_REGISTRY[mappedKey]) {
      return VIDEO_CAPABILITY_REGISTRY[mappedKey];
    }
  }

  return VIDEO_CAPABILITY_REGISTRY[defaultKey] || VIDEO_CAPABILITY_REGISTRY['sd-2.0-fast'];
}

export function validateVideoSettings(
  capability: VideoCapability,
  settings: VideoSettings,
  imageCount: number
): { valid: boolean; error?: string } {
  // Find matching variant
  const matchingVariant = capability.variants.find(
    v => v.resolution === settings.resolution && v.durationSeconds === settings.durationSeconds
  );

  if (!matchingVariant) {
    // Check if within acceptable limits
    const maxDuration = Math.max(...capability.variants.map(v => v.durationSeconds));
    if (settings.durationSeconds > maxDuration) {
      return {
        valid: false,
        error: `时长超限: 模型 ${capability.displayName} 最大支持 ${maxDuration} 秒视频生成。`
      };
    }
  }

  const maxImages = Math.max(...capability.variants.map(v => v.maxImages));
  if (imageCount > maxImages) {
    return {
      valid: false,
      error: `参考图超限: 模型 ${capability.displayName} 最多支持 ${maxImages} 张参考图，当前提供了 ${imageCount} 张。`
    };
  }

  return { valid: true };
}
