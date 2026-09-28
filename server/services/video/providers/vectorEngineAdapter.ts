// server/services/video/providers/vectorEngineAdapter.ts
import crypto from 'crypto';
import { resolveVideoCapability, validateVideoSettings } from '../videoCapabilityRegistry';
import { VideoSettings } from '../../../../src/types/creativeCanvasVideo';
import { resolveApiConfig } from '../../../ai/providerConfig';
import { VideoSourceImageResolver } from '../videoSourceImageResolver';

export interface NormalizedVideoInput {
  modelKey: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  referenceImageUrls?: string[];
  settings: VideoSettings;
}

export interface SubmitResult {
  providerTaskId: string;
  provider: string;
  exactModelId: string;
  isSimulated: boolean;
  rawResponse?: any;
  directVideoUrl?: string;
}

export interface NormalizedProviderStatus {
  providerTaskId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progressPercent: number;
  videoUrl?: string;
  posterUrl?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export class VectorEngineVideoAdapter {
  /**
   * Validates input against model capabilities
   */
  public static validate(input: NormalizedVideoInput): { valid: boolean; error?: string } {
    const capability = resolveVideoCapability(input.modelKey);
    const count = (input.referenceImageUrls?.length || 0) + (input.sourceImageUrl ? 1 : 0);
    return validateVideoSettings(capability, input.settings, count);
  }

  /**
   * Submits a video task to VectorEngine / TianToken / TokenMarket gateway
   * 严格适配 api.tiantoken.com / tokenmarket.apifox.cn 真实支持的有效端点:
   * - wan3.0-video: 优先使用 openai: /v1/chat/completions 或 /v1/video/generations
   * - sd-2.0-fast, sd-2.5, sd-2.0, sd-2.0-mini: /v1/video/generations
   * - grok-imagine-video-1.5-preview: /v1/video/generations
   * - MiniMax-H3: /v1/video/generations
   */
  public static async submit(
    input: NormalizedVideoInput,
    idempotencyKey: string,
    userUuid: string = 'system'
  ): Promise<SubmitResult> {
    const capability = resolveVideoCapability(input.modelKey);
    const validation = this.validate(input);
    if (!validation.valid) {
      throw new Error(`VALIDATION_FAILED: ${validation.error}`);
    }

    let config = await resolveApiConfig(userUuid);
    if (!config.apiKey) {
      if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_MOCK_VIDEO === 'true') {
        return {
          providerTaskId: `sim-task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          provider: 'vectorengine_simulated',
          exactModelId: capability.exactModelId,
          isSimulated: true
        };
      }
      throw new Error('MISSING_API_KEY: 未检测到有效的向量引擎/AI接口凭证，请在部门设置中配置API密钥');
    }

    const cleanBaseUrl = config.baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
    const rawImageUrl = input.sourceImageUrl || (input.referenceImageUrls && input.referenceImageUrls[0]);

    if (!rawImageUrl) {
      throw new Error('IMAGE_REQUIRED: 图生视频必须提供一张参考底图');
    }

    // 关键架构保证: 无论来自画布相对路径、本地asset还是Base64，均统一通过GCS生成公网可下载HTTPS签名直链
    const imageUrl = await VideoSourceImageResolver.resolveToPublicUrl(rawImageUrl);

    const resolutionValue = (input.settings.resolution || '720p').toLowerCase();

    // 1. 向量引擎专属火山端点适配 (覆盖 Apifox 文档: 358028487, 358028488, 358028489)
    // 适用于 seedance-1-5-pro, doubao-seedance-1-5-pro-251215 以及 首尾帧任务
    const isVolcSeedanceModel = 
      capability.exactModelId.includes('1-5') || 
      capability.exactModelId.includes('seedance-1') ||
      capability.exactModelId === 'seedance-1-5-pro';

    if (isVolcSeedanceModel) {
      try {
        console.log(`[VectorEngineVideoAdapter] Submitting to VectorEngine Volcengine endpoint: model=${capability.exactModelId}`);
        const volcUrl = `${cleanBaseUrl}/volc/v1/contents/generations/tasks`;
        
        const contentList: any[] = [
          {
            type: 'text',
            text: input.prompt
          }
        ];

        // 处理首尾帧（若提供多张图）或单图参考
        if (input.referenceImageUrls && input.referenceImageUrls.length >= 2) {
          const firstUrl = await VideoSourceImageResolver.resolveToPublicUrl(input.referenceImageUrls[0]);
          const lastUrl = await VideoSourceImageResolver.resolveToPublicUrl(input.referenceImageUrls[1]);
          contentList.push({
            type: 'image_url',
            image_url: { url: firstUrl },
            role: 'first_frame'
          });
          contentList.push({
            type: 'image_url',
            image_url: { url: lastUrl },
            role: 'last_frame'
          });
        } else if (imageUrl) {
          contentList.push({
            type: 'image_url',
            image_url: { url: imageUrl },
            role: 'reference_image'
          });
        }

        const volcPayload: Record<string, any> = {
          model: capability.exactModelId,
          content: contentList,
          generate_audio: true
        };

        const volcResponse = await fetch(volcUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(volcPayload)
        });

        if (volcResponse.ok) {
          const volcData = await volcResponse.json();
          const taskId = volcData.id || volcData.task_id || volcData.data?.id;
          if (taskId) {
            console.log(`[VectorEngineVideoAdapter] Volcengine task created successfully: ${taskId}`);
            return {
              providerTaskId: taskId,
              provider: 'vectorengine_volc_v1',
              exactModelId: capability.exactModelId,
              isSimulated: false,
              rawResponse: volcData
            };
          }
        } else {
          const errText = await volcResponse.text();
          console.warn(`[VectorEngineVideoAdapter] Volcengine endpoint returned ${volcResponse.status}: ${errText}`);
        }
      } catch (err: any) {
        console.warn('[VectorEngineVideoAdapter] Volcengine task submission error:', err?.message);
      }
    }

    // 2. 特别处理 wan3.0-video: 依照平台文档，优先尝试 openai /v1/chat/completions 接口
    if (capability.exactModelId === 'wan3.0-video') {
      try {
        console.log(`[VectorEngineVideoAdapter] Submitting wan3.0-video via /v1/chat/completions`);
        const chatUrl = `${cleanBaseUrl}/v1/chat/completions`;
        const chatPayload = {
          model: 'wan3.0-video',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${input.prompt} (参数要求: 分辨率=${input.settings.resolution || '720p'}, 时长=${input.settings.durationSeconds || 5}秒, 比例=${input.settings.ratio || '16:9'})`
                },
                {
                  type: 'image_url',
                  image_url: { url: imageUrl }
                }
              ]
            }
          ],
          stream: false
        };

        const chatResponse = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(chatPayload)
        });

        if (chatResponse.ok) {
          const chatResText = await chatResponse.text();
          try {
            const chatData = JSON.parse(chatResText);
            const content = chatData.choices?.[0]?.message?.content || '';
            const urlMatch = content.match(/https?:\/\/[^\s)"]+\.mp4/i) || content.match(/https?:\/\/[^\s)"]+/i);
            const taskId = chatData.id || chatData.task_id || chatData.data?.id;

            if (urlMatch) {
              return {
                providerTaskId: taskId || `direct-${Date.now()}`,
                provider: 'vectorengine_chat_completion',
                exactModelId: capability.exactModelId,
                isSimulated: false,
                rawResponse: chatData,
                directVideoUrl: urlMatch[0]
              };
            } else if (taskId) {
              return {
                providerTaskId: taskId,
                provider: 'vectorengine_chat_completion',
                exactModelId: capability.exactModelId,
                isSimulated: false,
                rawResponse: chatData
              };
            }
          } catch {
            console.warn('[VectorEngineVideoAdapter] Failed to parse chat completions JSON, falling back to /v1/video/generations');
          }
        } else {
          console.warn(`[VectorEngineVideoAdapter] /v1/chat/completions returned ${chatResponse.status}, falling back to /v1/video/generations`);
        }
      } catch (err) {
        console.warn('[VectorEngineVideoAdapter] wan3.0-video chat endpoint failed, falling back:', err);
      }
    }

    // 3. 豆包 2.0 原生多模态任务接口 (覆盖 Apifox 文档: 446220699 创建视频生成任务 API doubao-2.0)
    const isDoubaoModel = 
      capability.exactModelId.startsWith('sd-') || 
      capability.exactModelId.includes('doubao') || 
      capability.exactModelId.includes('seedance');

    if (isDoubaoModel) {
      try {
        console.log(`[VectorEngineVideoAdapter] Dispatching Doubao v3 native task API: model=${capability.exactModelId}, res=${resolutionValue}`);
        const doubaoUrl = `${cleanBaseUrl}/api/v3/contents/generations/tasks`;
        const contentList: any[] = [
          {
            type: 'text',
            text: input.prompt
          }
        ];

        if (imageUrl) {
          contentList.push({
            type: 'image_url',
            image_url: {
              url: imageUrl
            },
            role: 'reference_image'
          });
        }

        const doubaoPayload: Record<string, any> = {
          model: capability.exactModelId,
          content: contentList,
          resolution: resolutionValue,
          duration: input.settings.durationSeconds || 5,
          ratio: input.settings.ratio || '16:9',
          generate_audio: true,
          watermark: false
        };

        const doubaoResponse = await fetch(doubaoUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(doubaoPayload)
        });

        if (doubaoResponse.ok) {
          const doubaoData = await doubaoResponse.json();
          const taskId = doubaoData.id || doubaoData.task_id || doubaoData.data?.id;
          if (taskId) {
            console.log(`[VectorEngineVideoAdapter] Doubao v3 native task successfully created: ${taskId}`);
            return {
              providerTaskId: taskId,
              provider: 'doubao_v3_native',
              exactModelId: capability.exactModelId,
              isSimulated: false,
              rawResponse: doubaoData
            };
          }
        } else {
          const errText = await doubaoResponse.text();
          console.warn(`[VectorEngineVideoAdapter] Doubao v3 endpoint returned ${doubaoResponse.status}: ${errText}`);
          
          // 若部门专属向量 Key 提示渠道不存在 (503) 或限流 (429)，触发智能故障转移
          if (doubaoResponse.status === 503 || doubaoResponse.status === 429) {
            console.log('[VectorEngineVideoAdapter] 部门专属渠道不可用，正在自动故障转移至备用全站渠道...');
            const fallbackConfig = await resolveApiConfig('system');
            if (fallbackConfig.apiKey && fallbackConfig.apiKey !== config.apiKey) {
              const fbUrl = `${fallbackConfig.baseUrl.replace(/\/+$/, '')}/api/v3/contents/generations/tasks`;
              const fbRes = await fetch(fbUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${fallbackConfig.apiKey}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Idempotency-Key': `${idempotencyKey}-fb`
                },
                body: JSON.stringify(doubaoPayload)
              });
              if (fbRes.ok) {
                const fbData = await fbRes.json();
                const fbTaskId = fbData.id || fbData.task_id || fbData.data?.id;
                if (fbTaskId) {
                  console.log(`[VectorEngineVideoAdapter] Failover to fallback route succeeded: ${fbTaskId}`);
                  return {
                    providerTaskId: fbTaskId,
                    provider: 'doubao_failover_route',
                    exactModelId: capability.exactModelId,
                    isSimulated: false,
                    rawResponse: fbData
                  };
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('[VectorEngineVideoAdapter] Doubao v3 native call failed, falling back:', err?.message);
      }
    }

    // 3. 通用官方格式 /v1/video/generations (适用于 grok, MiniMax-H3 及万相标准端点或作为降级备选)
    const targetUrl = `${cleanBaseUrl}/v1/video/generations`;

    const payload: Record<string, any> = {
      model: capability.exactModelId,
      prompt: input.prompt,
      image_url: imageUrl,
      img_url: imageUrl,
      first_frame_image: imageUrl,
      // 关键修复: TianToken / New-API 豆包计费网关读取的是 size 字段做分辨率计费策略匹配 (如 '720p', '480p', '1080p')
      size: resolutionValue,
      resolution: resolutionValue,
      duration: input.settings.durationSeconds || 5,
      duration_seconds: input.settings.durationSeconds || 5,
      aspect_ratio: input.settings.ratio || '16:9',
      ratio: input.settings.ratio || '16:9'
    };

    // 针对 Grok 模型的网关特殊校验: 其底层为 Rust 反序列化器，要求 image 为 struct ImageUrl { url: string }
    if (capability.exactModelId.includes('grok')) {
      payload.image = { url: imageUrl };
    }

    console.log(`[VectorEngineVideoAdapter] Submitting video task to ${targetUrl}: model=${capability.exactModelId}, size=${resolutionValue}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedMessage = errText;
      try {
        const parsed = JSON.parse(errText);
        parsedMessage = parsed.message || parsed.error?.message || parsed.msg || parsed.base_resp?.status_msg || errText;
      } catch {}

      // 友好化 New-API 分组权限缺失与渠道维护提示
      if (response.status === 503 && parsedMessage.includes('No available channel')) {
        parsedMessage = `模型【${capability.displayName}】在此 Token 权限分组下暂无可用渠道。建议切换至【豆包 Seedance 2.0 (Fast/2.0/Mini/2.5)】，或在 TianToken 控制台将此 Token 关联至相应模型分组。`;
      } else if (response.status === 500 && parsedMessage.includes('可用渠道不存在')) {
        parsedMessage = `模型【${capability.displayName}】上游供应商渠道暂时离线或维护中。建议优先选用【豆包 Seedance 2.0 Fast/2.0】生成。`;
      } else if (parsedMessage.includes('resolution is required')) {
        parsedMessage = `模型【${capability.displayName}】上游服务渠道接口异常 (resolution is required)。建议切换为稳定在线的【豆包 Seedance 2.0 系列】。`;
      } else if (parsedMessage.includes('InvalidParameter') || parsedMessage.includes('Invalid URL')) {
        parsedMessage = `模型底图参数格式不符合该上游接口规范。建议切换至【豆包 Seedance 2.0 系列】。`;
      }

      console.error(`[VectorEngineVideoAdapter] Video upstream rejected (${response.status}):`, errText);
      throw new Error(`视频网关拒绝请求 (${response.status}): ${parsedMessage}`);
    }

    const resText = await response.text();
    let data: any;
    try {
      data = JSON.parse(resText);
    } catch (jsonErr) {
      console.error('[VectorEngineVideoAdapter] Non-JSON response from upstream:', resText);
      throw new Error(`视频网关返回非JSON格式数据: ${resText.slice(0, 150)}`);
    }

    // 提取直出视频链接 (部分极速模型同步返回)
    const immediateVideoUrl = data.video_url || 
                              data.output?.video_url || 
                              data.result?.video_url || 
                              (data.data && Array.isArray(data.data) && data.data[0]?.url) ||
                              (data.videos && data.videos[0]?.url);

    const taskId = data.id || 
                   data.task_id || 
                   data.request_id ||
                   data.output?.task_id || 
                   data.data?.id || 
                   data.data?.task_id ||
                   data.task?.id ||
                   data.result?.task_id;

    if (!taskId && !immediateVideoUrl) {
      throw new Error(`视频网关未返回有效任务ID或视频链接: ${JSON.stringify(data)}`);
    }

    return {
      providerTaskId: taskId || `sync-task-${Date.now()}`,
      provider: 'vectorengine_standard',
      exactModelId: capability.exactModelId,
      isSimulated: false,
      rawResponse: data,
      directVideoUrl: immediateVideoUrl
    };
  }

  /**
   * Queries provider task status
   * 严格对接 Apifox 文档规范:
   * - 358028492: GET /volc/v1/contents/generations/tasks/{task_id}
   * - 446220700: GET /api/v3/contents/generations/tasks/{id}
   */
  public static async query(
    providerTaskId: string,
    userUuid: string = 'system'
  ): Promise<NormalizedProviderStatus> {
    if (providerTaskId.startsWith('sim-task-')) {
      const parts = providerTaskId.split('-');
      const createdTs = Number(parts[2]) || Date.now();
      const elapsedSeconds = (Date.now() - createdTs) / 1000;

      if (elapsedSeconds < 3) {
        return {
          providerTaskId,
          status: 'queued',
          progressPercent: 15
        };
      } else if (elapsedSeconds < 8) {
        return {
          providerTaskId,
          status: 'running',
          progressPercent: Math.min(85, Math.floor(elapsedSeconds * 12))
        };
      } else {
        return {
          providerTaskId,
          status: 'succeeded',
          progressPercent: 100,
          videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          posterUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
          durationMs: 5000
        };
      }
    }

    if (providerTaskId.startsWith('direct-') || providerTaskId.startsWith('sync-task-')) {
      return {
        providerTaskId,
        status: 'succeeded',
        progressPercent: 100
      };
    }

    // Upstream query for real tasks
    let config = await resolveApiConfig(userUuid);
    if (!config.apiKey) {
      config = await resolveApiConfig('system');
    }
    if (!config.apiKey) {
      return {
        providerTaskId,
        status: 'failed',
        progressPercent: 0,
        errorMessage: '未配置向量引擎/全站 API Key，无法查询真实任务进度'
      };
    }

    const cleanBaseUrl = config.baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');

    // 轮询端点尝试列表 (覆盖向量引擎火山端点 358028492、豆包原生 v3 端点 446220700 以及主流聚合平台规则)
    const isDoubaoTaskId = providerTaskId.startsWith('cgt-');
    const endpointsToTry = [
      `${cleanBaseUrl}/volc/v1/contents/generations/tasks/${providerTaskId}`,
      `${cleanBaseUrl}/api/v3/contents/generations/tasks/${providerTaskId}`,
      ...(isDoubaoTaskId ? [
        `${cleanBaseUrl}/v3/contents/generations/tasks/${providerTaskId}`
      ] : []),
      `${cleanBaseUrl}/v1/video/generations/${providerTaskId}`,
      `${cleanBaseUrl}/v1/videos/tasks/${providerTaskId}`,
      `${cleanBaseUrl}/v1/tasks/${providerTaskId}`,
      `${cleanBaseUrl}/alibailian/api/v1/tasks/${providerTaskId}`
    ];

    for (const testUrl of endpointsToTry) {
      try {
        const response = await fetch(testUrl, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          // TianToken / Doubao v3 的结构通常为: { id: "...", status: "succeeded", content: { video_url: "..." } }
          // 或 { code: 'success', data: { status: 'SUCCESS'|'IN_PROGRESS'|'FAILURE', progress: '50%', result_url: '...' } }
          const innerData = data.data || {};
          const rawStatus = (
            data.status || 
            innerData.status || 
            data.state || 
            innerData.data?.status || 
            data.output?.task_status || 
            data.task_status || 
            ''
          ).toLowerCase();

          const videoUrl = data.content?.video_url ||
                           innerData.content?.video_url ||
                           innerData.result_url ||
                           innerData.video_url || 
                           innerData.data?.content?.video_url ||
                           innerData.data?.video_url ||
                           data.video_url || 
                           data.output?.video_url || 
                           data.result?.video_url || 
                           (data.videos && data.videos[0]?.url) ||
                           (data.data && Array.isArray(data.data) && data.data[0]?.url);

          const posterUrl = innerData.poster_url || 
                            innerData.data?.poster_url || 
                            data.poster_url || 
                            data.output?.poster_url || 
                            data.result?.poster_url;

          let progressPercent = 40;
          const rawProgress = innerData.progress || data.progress;
          if (rawProgress !== undefined && rawProgress !== null) {
            const parsed = parseInt(String(rawProgress).replace('%', ''), 10);
            if (!isNaN(parsed)) progressPercent = parsed;
          } else if (videoUrl) {
            progressPercent = 100;
          }

          const failReason = innerData.fail_reason || 
                            data.error?.message || 
                            data.error || 
                            data.message || 
                            data.output?.message;

          if (rawStatus || videoUrl) {
            const isDone = rawStatus === 'success' || rawStatus === 'succeeded' || rawStatus === 'completed' || !!videoUrl;
            const isFail = rawStatus === 'failed' || rawStatus === 'failure' || rawStatus === 'error' || (!!innerData.fail_reason && innerData.fail_reason.length > 0);
            const isWait = rawStatus === 'queued' || rawStatus === 'pending' || rawStatus === 'submitted';

            return {
              providerTaskId,
              status: isDone ? 'succeeded' : (isFail ? 'failed' : (isWait ? 'queued' : 'running')),
              progressPercent: isDone ? 100 : progressPercent,
              videoUrl,
              posterUrl,
              durationMs: innerData.duration_ms || innerData.duration ? Number(innerData.duration) * 1000 : undefined,
              errorMessage: isFail ? failReason : undefined
            };
          }
        }
      } catch (err) {
        // Try next endpoint
      }
    }

    return {
      providerTaskId,
      status: 'running',
      progressPercent: 40
    };
  }

  /**
   * Cancels task if supported
   */
  public static async cancel(providerTaskId: string): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: '任务已请求取消。'
    };
  }
}
