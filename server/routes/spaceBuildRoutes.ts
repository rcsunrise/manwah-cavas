// server/routes/spaceBuildRoutes.ts
// MANWAH Space Studio｜BUILD 阶段核心服务端 API 路由 V3.0
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GcsAssetStorage } from '../services/storage/gcsAssetStorage';
import { SpaceObjectKeyBuilder } from '../../src/shared/storage/spaceObjectKeys';
import { SpaceImageGenerationService } from '../services/spaceImageGenerationService';
import {
  SpaceProductAnalysisService,
  AnalyzeProductRequestSchema
} from '../services/spaceProductAnalysisService';
import sharp from 'sharp';
import { createServerGenAI } from '../utils/aiClient';
import { resolveApiConfig, isProviderKeyValid } from '../ai/providerConfig';
import {
  LayoutSearchRequestSchema,
  StyleRecommendRequestSchema,
  recommendStylesForLayout,
  searchLayouts
} from '../services/spaceLayoutAgentService';

const router = Router();
const storage = GcsAssetStorage.getInstance();

/** POST /api/space/build/layout-agent/search — AI 户型智能体：联网 + 参考图生成户型方案 */
router.post('/layout-agent/search', async (req: Request, res: Response) => {
  const parsed = LayoutSearchRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: '请求参数无效' });
  try {
    const data = await searchLayouts((req as any).user?.id || 'system', parsed.data);
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[layout-agent/search] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || '户型查找失败' });
  }
});

/** POST /api/space/build/layout-agent/recommend-styles — 按选定户型推荐现有美学并新建风格 */
router.post('/layout-agent/recommend-styles', async (req: Request, res: Response) => {
  const parsed = StyleRecommendRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: '请求参数无效' });
  try {
    const data = await recommendStylesForLayout((req as any).user?.id || 'system', parsed.data);
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[layout-agent/recommend-styles] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || '美学推荐失败' });
  }
});

/**
 * POST /api/space/build/extract-product-dna
 * 产品图片资产上传、GCS持久化与多模态AI深度物理读数
 */
router.post('/extract-product-dna', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeProductRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product analysis payload',
        details: parsed.error.issues
      });
    }

    const userId = (req as any).user?.id || 'system';
    const result = await SpaceProductAnalysisService.analyzeAndExtract(parsed.data, userId);

    return res.json({
      success: true,
      data: result
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to analyze product DNA';
    return res.status(500).json({
      success: false,
      error: message
    });
  }
});

/**
 * POST /api/space/build/analyze-scene-ensemble
 * 独立场景整套资产多模态结构化识别接口：
 * 直接识别沙发组、茶几、地毯、餐边柜、展示柜、餐桌椅、软装挂画摆件等全要素，
 * 整体生成并作为组合资产入库与置入
 */
router.post('/analyze-scene-ensemble', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeProductRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid scene ensemble payload',
        details: parsed.error.issues
      });
    }

    const userId = (req as any).user?.id || 'system';
    const result = await SpaceProductAnalysisService.analyzeWholeSceneEnsemble(parsed.data, userId);

    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to analyze whole scene ensemble';
    console.error('[spaceBuildRoutes] analyze-scene-ensemble error:', err);
    return res.status(500).json({
      success: false,
      error: message
    });
  }
});


const LockSceneMasterSchema = z.object({
  projectId: z.string().min(1),
  sceneMasterId: z.string().min(1),
  revisionId: z.string().min(1),
  aspectRatio: z.string().optional(),
  generationSettings: z.record(z.string(), z.any()).optional(),
  promptSnapshot: z.record(z.string(), z.any()),
  primaryProduct: z
    .object({
      id: z.string().optional(),
      sku: z.string().optional(),
      name: z.string().optional(),
      materials: z.array(z.string()).optional(),
      colors: z.array(z.string()).optional(),
      surfaceTexture: z.string().optional(),
      referenceImage: z.string().optional(),
      referenceImageUrl: z.string().optional(),
      referenceImages: z.array(z.any()).optional()
    })
    .passthrough()
    .optional(),
  locks: z.object({
    productIdentity: z.boolean().default(true),
    placement: z.boolean().default(true),
    architecture: z.boolean().default(true),
    style: z.boolean().default(true),
    material: z.boolean().default(true),
    lighting: z.boolean().default(true),
    camera: z.boolean().default(true),
    human: z.boolean().default(false)
  })
});

/**
 * POST /api/space/build/analyze-style-image
 * 上传或传入空间参考图，利用多模态视觉大模型深度识别风格、分类并提取结构化 Prompt
 */
export const AnalyzeStyleImageSchema = z.object({
  image: z.string().min(1, 'Image data or URL is required'),
  userNotes: z.string().optional()
});

router.post('/analyze-style-image', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeStyleImageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: parsed.error.issues
      });
    }

    const { image: rawImage, userNotes } = parsed.data;
    const userId = (req as any).user?.id || 'system';

    // 1. 解析图像输入 (DataURL / 纯 Base64 / HTTP URL)
    let mimeType = 'image/jpeg';
    let base64Data = '';

    if (rawImage.startsWith('data:')) {
      const match = rawImage.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    } else if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
      const fetchResp = await fetch(rawImage);
      if (!fetchResp.ok) {
        throw new Error(`Failed to fetch image URL: ${fetchResp.statusText}`);
      }
      const arrayBuf = await fetchResp.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      base64Data = buf.toString('base64');
      const ct = fetchResp.headers.get('content-type');
      if (ct && ct.startsWith('image/')) {
        mimeType = ct;
      }
    } else {
      base64Data = rawImage.replace(/\s+/g, '');
    }

    if (!base64Data) {
      return res.status(400).json({
        success: false,
        error: '无效的图像数据'
      });
    }

    // 2. 利用 sharp 对超大图片做轻量缩放与尺寸优化，加快视觉模型解析
    try {
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const resizedBuffer = await sharp(imgBuffer)
        .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      base64Data = resizedBuffer.toString('base64');
      mimeType = 'image/jpeg';
    } catch (sharpErr) {
      console.warn('[analyze-style-image] sharp resize bypass:', sharpErr);
    }

    // 3. 调用多模态视觉大模型
    const { ai, isValidKey } = await createServerGenAI(userId);

    let extracted: any = null;

    if (ai && isValidKey) {
      const promptText = `你是一位国际知名室内建筑设计大师与空间摄影总监。
请深入分析上传的室内空间参考图，精准识别其空间硬装结构、建筑材质工艺、光影特征与色彩调性，并输出结构化 JSON：
{
  "styleName": "简练高级的风格名称（例如：'意式轻奢 · 暖灰大平层'、'现代极简 · 落地窗通透空间'、'侘寂光影 · 微水泥质感大宅'、'法式复古 · 优雅雕花空间'、'新中式 · 东方雅境'）",
  "category": "必须在以下6个选项中严格挑选最贴近的一个：['现代极简', '意式轻奢', '侘寂风', '法式复古', '新中式', '自然原木']",
  "lightingTone": "光影特征简述（例如：'天然通透漫射光'、'晨曦柔和侧逆光'、'温暖斜阳漫射'、'无主灯线性泛光'）",
  "promptFragment": "详尽精确的专业室内商业摄影 Prompt（包含空间硬装材质如微水泥/大理石/木饰面、大面积落地窗采光、色彩系统、空间留白、8K 室内商业摄影质感，适合作为 AI 生图风格锚定词）",
  "tags": ["3到5个代表性关键词标签，如：落地窗, 暖灰调, 奢石质感, 大平层"]
}
${userNotes ? `\n用户额外补充说明：${userNotes}` : ''}
严格直接输出 JSON 对象，不要多余修饰。`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ] as any
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = response.text || '';
        const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0]);
        }
      } catch (aiErr: any) {
        console.warn('[analyze-style-image] AI Analysis failed:', aiErr?.message);
      }
    }

    // 4. 规范化并保证 100% 结构完整与健壮回退
    const validCategories = ['现代极简', '意式轻奢', '侘寂风', '法式复古', '新中式', '自然原木'];
    let finalCategory = extracted?.category || '现代极简';
    if (!validCategories.includes(finalCategory)) {
      const matchCat = validCategories.find(c => finalCategory.includes(c) || c.includes(finalCategory));
      finalCategory = matchCat || '现代极简';
    }

    const finalStyleName = extracted?.styleName?.trim() || `${finalCategory} · 质感私宅空间`;
    const finalLighting = extracted?.lightingTone?.trim() || '天然通透漫射光';
    const finalPrompt = extracted?.promptFragment?.trim() || 
      `${finalStyleName}，大面积通透采光，高级哑光硬装质感，极简大平层室内建筑摄影，色调克制高级，大师级构图，8K，写实光影`;
    const finalTags = Array.isArray(extracted?.tags) && extracted.tags.length > 0 
      ? extracted.tags 
      : [finalCategory, 'AI视觉识别', '自定义空间'];

    return res.json({
      success: true,
      data: {
        styleName: finalStyleName,
        category: finalCategory,
        lightingTone: finalLighting,
        promptFragment: finalPrompt,
        tags: finalTags
      }
    });
  } catch (err: any) {
    console.error('[analyze-style-image] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || '风格识别解析失败'
    });
  }
});

export default router;

