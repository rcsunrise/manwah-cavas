// server/services/video/videoModelAvailability.ts
// 通过网关免费的 GET /v1/models 探测当前令牌开通了哪些视频模型，结果缓存 5 分钟
import { VideoCapability } from '../../../src/types/creativeCanvasVideo';
import { resolveApiConfig } from '../../ai/providerConfig';

const CACHE_TTL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;

let cached: { modelIds: Set<string>; fetchedAt: number } | null = null;
let inFlight: Promise<Set<string> | null> | null = null;

async function fetchModelIds(): Promise<Set<string> | null> {
  const config = await resolveApiConfig('system');
  if (!config.apiKey) return null;
  const baseUrl = config.baseUrl.replace(/\/+$/, '').replace(/\/(v1beta|v1)$/, '');
  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
  });
  if (!res.ok) {
    console.warn(`[videoModelAvailability] /v1/models returned ${res.status}`);
    return null;
  }
  const body: any = await res.json();
  return new Set<string>((body?.data || []).map((m: any) => String(m.id)));
}

export async function getTokenModelIds(): Promise<Set<string> | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.modelIds;
  if (!inFlight) {
    inFlight = fetchModelIds()
      .then(ids => {
        if (ids) cached = { modelIds: ids, fetchedAt: Date.now() };
        return ids;
      })
      .catch(err => {
        console.warn('[videoModelAvailability] probe failed:', err?.message || err);
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  // 探测失败时沿用上一次结果（即便已过期），都没有则返回 null 表示未知
  return (await inFlight) || cached?.modelIds || null;
}

export async function annotateCapabilityAvailability(capabilities: VideoCapability[]): Promise<VideoCapability[]> {
  const modelIds = await getTokenModelIds();
  if (!modelIds) return capabilities;
  return capabilities.map(cap => {
    const available = modelIds.has(cap.exactModelId);
    return {
      ...cap,
      available,
      availabilityNote: available ? undefined : '当前令牌未开通该模型分组'
    };
  });
}
