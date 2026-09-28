// server/services/video/videoDirectorService.ts
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  VideoDirectorPlan,
  VideoShotPlan,
  VideoDirectorBriefRequest
} from '../../../src/types/creativeCanvasVideo';
import { resolveApiConfig } from '../../ai/providerConfig';

export class VideoDirectorService {
  /**
   * Generates a structured director brief and shot list
   */
  public static async generateDirectorBrief(
    request: VideoDirectorBriefRequest
  ): Promise<VideoDirectorPlan> {
    const {
      mode,
      style,
      userPrompt,
      focusPoint,
      focusPoints,
      dnaSummary,
      sourceAssetVersionId,
      sourceImageUrl,
      directorModelKey,
      referenceImages,
      productTitle,
      productCategory,
      productDetails
    } = request;

    const planVersionId = `plan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const shotCount = style === 'single_take' ? 1 : 3;

    // Sanitize productTitle to ensure no image-node ID leaks into prompts
    let cleanedProductTitle = (productTitle || '').trim();
    const isNodePlaceholder = 
      cleanedProductTitle.startsWith('node-') || 
      cleanedProductTitle.startsWith('img-node-') || 
      cleanedProductTitle.startsWith('asset-') || 
      cleanedProductTitle.startsWith('ref-') ||
      cleanedProductTitle.match(/^[a-z0-9-_]{8,}$/i);

    if (!cleanedProductTitle || isNodePlaceholder) {
      cleanedProductTitle = '现代意式高档真皮功能沙发';
    }

    // Resolve model name
    const modelMap: Record<string, string> = {
      'gemini-3.7-flash': 'gemini-3.7-flash',
      'gemini-3.8-flash': 'gemini-3.8-flash',
      'gpt-6': 'gpt-6-astra',
      'gpt-6-astra': 'gpt-6-astra',
      'gpt-5.6': 'gpt-5.6-sol',
      'gpt-5.6-sol': 'gpt-5.6-sol',
      'gpt-5.6-luna': 'gpt-5.6-luna'
    };
    const targetModel = modelMap[directorModelKey || ''] || 'gemini-3.7-flash';

    // Aggregate focus points
    const activeFocusList: string[] = [];
    if (Array.isArray(focusPoints) && focusPoints.length > 0) {
      activeFocusList.push(...focusPoints);
    } else if (focusPoint && focusPoint.trim()) {
      activeFocusList.push(focusPoint.trim());
    } else {
      activeFocusList.push('皮面细腻质感与缝线工艺', '整体空间极简光影搭配');
    }
    const focusString = activeFocusList.join('、');

    // Collect valid public image URLs for multimodal inspection
    const candidateUrls: string[] = [];
    if (sourceImageUrl && (sourceImageUrl.startsWith('http://') || sourceImageUrl.startsWith('https://'))) {
      candidateUrls.push(sourceImageUrl);
    }
    if (Array.isArray(referenceImages)) {
      for (const img of referenceImages) {
        if (img?.url && (img.url.startsWith('http://') || img.url.startsWith('https://')) && !candidateUrls.includes(img.url)) {
          candidateUrls.push(img.url);
        }
      }
    }

    // Build director system prompt with strong product invariants
    const prompt = `你是一位专注于高端家具与家居电商的专业影视广告导演与视觉策略专家。
请根据用户的产品要求与输入描述，为该家具产品制定一份严密的【${style === 'single_take' ? '单镜头一镜到底' : '3分镜组合混剪'}分镜脚本方案】。

【核心约束条件 (Strict Product Invariants)】:
1. 严禁脱离产品！所有镜头的运镜、构图与提示词必须严格围绕该家具产品本身（品类: ${productCategory || '高端现代家具'}, 名称: ${cleanedProductTitle}）展开。
2. 严禁在生成的任何文案、说明、名称或英文 Prompt 中使用类似 'img-node-1'、'node-xxx'、'asset-xxx'、'ref-xxx' 等代表画布节点 ID 的拼合字符，这些是不可视的代码，将其翻译或呈现出来是重大系统缺陷。请将其转换为该家具的真实描述（如：'森林绿高端科技布真皮功能沙发'）。
3. 必须将产品的所有关键外观修饰词（尤其是主色调如 'forest green / deep emerald green'，材质如 'premium tech fabric / velvet upholstery' 等）作为最高权重修饰词，强制锁定并拼装在每个分镜英文 prompt 的前部！
4. 必须深度融入以下【展示重点】: ${focusString}。每个分镜都必须重点呈现这些功能点与细节质感！
5. 严禁改变家具原有的形态、结构、材质与色彩！生成的英文 prompt 必须让生图/生视频模型死死锚定该原图特征。
6. 镜头运动必须缓慢、高级、平稳（如微距平移、缓推推进、光影漫反射流动），不得有突兀的剧烈畸变或跳跃。
7. 画面中不生成任何人工合成文本、水印或虚假字幕。

【输入产品信息】:
- 产品品类与名称: ${cleanedProductTitle} (${productCategory || '客厅家具'})
- 创作模式: ${mode} (${mode === 'product_showcase' ? '产品展示' : '自由生成'})
- 运镜风格: ${style} (${style === 'single_take' ? '一镜到底连贯运镜' : '多镜头分步特写'})
- 多选展示重点: ${focusString}
- 产品DNA特征: ${dnaSummary || productDetails || '现代意式极简风格，真皮触感，饱满扶手，金属纤细底脚'}
- 用户创意要求: ${userPrompt || '产品全景微移，展现高端居家光影质感'}

请输出严格的 JSON 格式（不要使用 Markdown 标记包裹），字段要求如下：
{
  "summary": "简短的方案总体构想阐述（清晰说明如何展示上述功能点，严禁包含任何 img-node 等节点ID标识）",
  "lockedRules": [
    "保持家具产品的整体比例、面料材质与轮廓无畸变",
    "高光自然流动，重点呈现【${focusString}】",
    "运镜保持匀速缓推，背景自然虚化凸显产品焦点"
  ],
  "shots": [
    {
      "order": 1,
      "title": "镜头名称 (如：空间全景氛围与产品形态)",
      "composition": "构图方式 (如：45度斜侧景深构图，产品居中)",
      "cameraMotion": "运镜手法 (如：镜头水平向右缓慢滑动5厘米并微推)",
      "subjectMotion": "主体状态 (如：静止，自然光在皮面漫射流转)",
      "durationSeconds": 5,
      "prompt": "高质量英文提示词，必须在句首明确且强制锁定原图的颜色和材质（例如：'A cinematic slow push-in shot of a forest green premium tech fabric modern Italian functional sofa with top-grain detailed stitching...'），后续加上光影环境、运镜方式与【${focusString}】细节特征，超高清 4k cinematic photorealistic",
      "negativeConstraints": ["变形", "杂乱背景", "结构突变", "字幕水印", "变色", "img-node"]
    }
  ]
}`;

    try {
      const config = await resolveApiConfig();
      if (config.apiKey && config.provider === 'vectorengine') {
        const cleanBaseUrl = config.baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
        const targetUrl = `${cleanBaseUrl}/v1/chat/completions`;

        // Prepare message content (support multimodal if reference image is available)
        let userMessageContent: any = prompt;
        if (candidateUrls.length > 0) {
          userMessageContent = [
            { type: 'text', text: prompt },
            ...candidateUrls.slice(0, 2).map(url => ({
              type: 'image_url',
              image_url: { url }
            }))
          ];
        }

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              {
                role: 'system',
                content: 'You are an elite cinematic commercial director for luxury furniture. Output strictly valid JSON without markdown wrapping.'
              },
              {
                role: 'user',
                content: userMessageContent
              }
            ],
            temperature: 0.3
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content || '';
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            const shots: VideoShotPlan[] = (parsed.shots || []).slice(0, shotCount).map((s: any, idx: number) => ({
              shotId: `shot-${idx + 1}-${crypto.randomBytes(3).toString('hex')}`,
              order: idx + 1,
              title: s.title || `镜头 ${idx + 1}`,
              composition: s.composition || '中心黄金分割构图',
              cameraMotion: s.cameraMotion || '缓推近景',
              subjectMotion: s.subjectMotion || '产品静止，光影流动',
              durationSeconds: Number(s.durationSeconds) || 5,
              prompt: s.prompt || userPrompt,
              negativeConstraints: s.negativeConstraints || ['变形', '模糊', '伪影'],
              referenceAssetVersionIds: sourceAssetVersionId ? [sourceAssetVersionId] : []
            }));

            return {
              planVersionId,
              summary: parsed.summary || `针对【${focusString}】的定制影视级运镜展示方案`,
              lockedRules: parsed.lockedRules || [
                '保持产品原始外观与几何特征稳定',
                `重点呈现 ${focusString}`,
                '无突兀视角形变'
              ],
              shots,
              estimatedDurationSeconds: shots.reduce((acc, cur) => acc + cur.durationSeconds, 0),
              directorModel: targetModel,
              createdAt: new Date().toISOString()
            };
          }
        } else {
          const errText = await response.text();
          console.warn(`[VideoDirectorService] Model ${targetModel} returned status ${response.status}:`, errText);
        }
      }
    } catch (err) {
      console.warn('[VideoDirectorService] LLM director call failed, falling back to deterministic plan:', err);
    }

    // Deterministic High-Quality Fallback
    const prodName = cleanedProductTitle || '现代意式高端真皮家具';
    const shots: VideoShotPlan[] = [];
    if (shotCount === 1) {
      shots.push({
        shotId: `shot-1-${crypto.randomBytes(3).toString('hex')}`,
        order: 1,
        title: '一镜到底：全景氛围缓推',
        composition: '45度微仰视，黄金分割透视居中',
        cameraMotion: '镜头自右前方以平缓匀速向主体左侧推进',
        subjectMotion: `家具主体静置，客厅柔和晨光漫射在皮革缝线边缘，展现【${focusString}】`,
        durationSeconds: 5,
        prompt: `Cinematic product showcase video of ${prodName}, featuring ${focusString}, stable geometry, slow smooth camera push in, elegant luxury living room ambient lighting, 4k ultra-detailed photorealistic: ${userPrompt}`,
        negativeConstraints: ['morphing', 'blur', 'flicker', 'floating artifacts', 'text', 'watermark'],
        referenceAssetVersionIds: sourceAssetVersionId ? [sourceAssetVersionId] : []
      });
    } else {
      shots.push(
        {
          shotId: `shot-1-${crypto.randomBytes(3).toString('hex')}`,
          order: 1,
          title: '空间全景氛围与产品轮廓',
          composition: '广角微俯视，宽阔客厅环境',
          cameraMotion: '平缓右移并轻微推进',
          subjectMotion: '主体居中，空间氛围温润，展示整体比例',
          durationSeconds: 4,
          prompt: `Cinematic wide master shot of ${prodName} in modern living space, showcasing overall form and silhouette, smooth gentle pan right, 4k photorealistic: ${userPrompt}`,
          negativeConstraints: ['morphing', 'deformed limbs', 'watermark'],
          referenceAssetVersionIds: sourceAssetVersionId ? [sourceAssetVersionId] : []
        },
        {
          shotId: `shot-2-${crypto.randomBytes(3).toString('hex')}`,
          order: 2,
          title: `特写呈现：${focusString.split('、')[0] || '核心材质工艺'}`,
          composition: '微距景深虚化，聚焦扶手与绗缝',
          cameraMotion: '沿扶手轮廓线缓慢滑移',
          subjectMotion: `皮质反光随视角细微变化，凸显【${focusString}】`,
          durationSeconds: 3,
          prompt: `Macro cinematic shot focusing on ${focusString}, fine details and stitches of ${prodName}, shallow depth of field, studio ray tracing: ${userPrompt}`,
          negativeConstraints: ['unstable geometry', 'noise', 'blur'],
          referenceAssetVersionIds: sourceAssetVersionId ? [sourceAssetVersionId] : []
        },
        {
          shotId: `shot-3-${crypto.randomBytes(3).toString('hex')}`,
          order: 3,
          title: '定格沉淀与品牌光影收尾',
          composition: '经典正侧视构图',
          cameraMotion: '极慢后拉定格',
          subjectMotion: '光影逐渐稳定，凸显产品高级质感',
          durationSeconds: 3,
          prompt: `Cinematic settling shot of ${prodName}, slow pull back to settle, premium studio ambient lighting, ultra-high dynamic range: ${userPrompt}`,
          negativeConstraints: ['distortion', 'text overlay'],
          referenceAssetVersionIds: sourceAssetVersionId ? [sourceAssetVersionId] : []
        }
      );
    }

    return {
      planVersionId,
      summary: `基于【${focusString}】的${style === 'single_take' ? '一镜到底' : '多镜头混剪'}影视级展示方案`,
      lockedRules: [
        '保持参考图中家具的整体比例与轮廓无几何畸变',
        `重点呈现 ${focusString}`,
        '运镜平缓匀速，严禁剧烈抖动与跳帧'
      ],
      shots,
      estimatedDurationSeconds: shots.reduce((acc, cur) => acc + cur.durationSeconds, 0),
      directorModel: targetModel,
      createdAt: new Date().toISOString()
    };
  }
}
