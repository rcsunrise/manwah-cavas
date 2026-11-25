// scripts/probe_video_models.ts
// 视频模型连通性探测：只调用免费的 GET /v1/models，不创建任何生成任务、不消耗额度。
// 用法: npx tsx scripts/probe_video_models.ts
import '../server/loadEnv';
import { resolveApiConfig } from '../server/ai/providerConfig';
import { getAvailableVideoCapabilities } from '../server/services/video/videoCapabilityRegistry';

const VIDEO_MODEL_PATTERN = /video|seedance|sd-|wan|kling|grok-imagine|minimax|hailuo|vidu|veo|omni/i;

async function main() {
  const config = await resolveApiConfig('system');
  if (!config.apiKey) {
    console.log('未解析到 system API Key');
    return;
  }
  const baseUrl = config.baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
  console.log(`baseUrl=${baseUrl} key=***${config.apiKey.slice(-4)}`);

  const started = Date.now();
  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(20000)
  });
  console.log(`/v1/models -> ${res.status} (${Date.now() - started}ms)`);
  const body: any = await res.json().catch(() => ({}));
  const ids: string[] = (body.data || []).map((m: any) => String(m.id));
  console.log(`令牌可用模型总数: ${ids.length}`);
  console.log('其中视频相关:', ids.filter(id => VIDEO_MODEL_PATTERN.test(id)).sort().join(', ') || '(无)');

  console.log('\n注册表中启用的视频模型 → 令牌是否可用:');
  for (const cap of getAvailableVideoCapabilities()) {
    console.log(`  ${cap.key.padEnd(34)} exact=${cap.exactModelId.padEnd(34)} ${ids.includes(cap.exactModelId) ? '✅ 可用' : '❌ 令牌无此模型'}`);
  }
}

main().catch(err => {
  console.error('探测失败:', err?.message || err);
  process.exit(1);
});
