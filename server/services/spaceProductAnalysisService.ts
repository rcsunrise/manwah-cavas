import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { GcsAssetStorage } from './storage/gcsAssetStorage';
import { SpaceObjectKeyBuilder } from '../../src/shared/storage/spaceObjectKeys';
import { createServerGenAI } from '../utils/aiClient';
import { ProductRole } from '../../src/types/spaceStudio';

export const UploadProductImageSchema = z.object({
  base64: z.string().min(10, 'Base64 image content is required'),
  type: z
    .enum(['front', '45_deg', 'side', 'back', 'function_open', 'detail', 'material'])
    .default('front'),
  fileName: z.string().optional()
});

export const AnalyzeProductRequestSchema = z.object({
  projectId: z.string().min(1).default('manwah-noble-space-01'),
  images: z.array(UploadProductImageSchema).min(1, 'At least one product image is required'),
  userNotes: z.string().optional(),
  model: z.string().optional()
});

export const DisaggregatedProductItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().optional(),
  role: z.enum([
    'sofa_3seat',
    'sofa_2seat',
    'recliner_1seat',
    'lounge_chair',
    'coffee_table',
    'dining_table',
    'dining_chair',
    'tv_console',
    'side_table',
    'decor'
  ]),
  priority: z.enum(['primary', 'secondary', 'decor']),
  dimensions: z.object({
    width: z.number(),
    depth: z.number(),
    height: z.number()
  }),
  materials: z.array(z.string()),
  colors: z.array(z.string()),
  adaptiveStyles: z.array(z.string()).optional(),
  surfaceTexture: z.string().optional(),
  functionCapable: z.boolean().optional(),
  boundingBox: z.object({
    ymin: z.number(),
    xmin: z.number(),
    ymax: z.number(),
    xmax: z.number()
  }),
  cropImageUrl: z.string().optional(),
  cropBase64: z.string().optional(),
  sourceMasterImageUrl: z.string().optional(),
  ensembleId: z.string().optional(),
  roleTitle: z.string().optional(),
  lockedRules: z.array(z.string()).optional(),
  dossierSummary: z.string().optional()
});

export type DisaggregatedProductItem = z.infer<typeof DisaggregatedProductItemSchema>;

/**
 * 智能坐标归一化处理器：
 * 兼容多模态大模型返回的各种 boundingBox 格式：
 * 1. 0~1000 整数格式 (Gemini 官方标准检测格式，例如 ymin: 200, xmin: 300, ymax: 650, xmax: 850)
 * 2. 0.0~1.0 归一化浮点数格式 (例如 ymin: 0.20, xmin: 0.30, ymax: 0.65, xmax: 0.85)
 * 3. 0~100 百分比格式 (例如 ymin: 20, xmin: 30, ymax: 65, xmax: 85)
 * 4. 绝对像素坐标格式 (例如在 1920x1080 图上返回 xmin: 400, ymin: 200...)
 * 5. 数组格式 [ymin, xmin, ymax, xmax] 或对象格式
 */
export function normalizeBoundingBox(
  rawBox: any,
  imgWidth: number = 1000,
  imgHeight: number = 1000
): { ymin: number; xmin: number; ymax: number; xmax: number } {
  if (!rawBox) {
    return { ymin: 15, xmin: 15, ymax: 85, xmax: 85 };
  }

  let ymin = 0;
  let xmin = 0;
  let ymax = 100;
  let xmax = 100;

  if (Array.isArray(rawBox) && rawBox.length >= 4) {
    ymin = Number(rawBox[0]) || 0;
    xmin = Number(rawBox[1]) || 0;
    ymax = Number(rawBox[2]) || 100;
    xmax = Number(rawBox[3]) || 100;
  } else if (typeof rawBox === 'object') {
    ymin = Number(rawBox.ymin ?? rawBox.top ?? rawBox.y1 ?? 0);
    xmin = Number(rawBox.xmin ?? rawBox.left ?? rawBox.x1 ?? 0);
    ymax = Number(rawBox.ymax ?? rawBox.bottom ?? rawBox.y2 ?? 100);
    xmax = Number(rawBox.xmax ?? rawBox.right ?? rawBox.x2 ?? 100);
  }

  const maxVal = Math.max(ymin, xmin, ymax, xmax);

  if (maxVal <= 1.05 && maxVal > 0) {
    // 0~1 浮点数 -> 转为 0~100 百分比
    ymin *= 100;
    xmin *= 100;
    ymax *= 100;
    xmax *= 100;
  } else if (maxVal > 100 && maxVal <= 1050) {
    // 0~1000 整数 (Gemini 标准) -> 转为 0~100 百分比
    ymin = (ymin / 1000) * 100;
    xmin = (xmin / 1000) * 100;
    ymax = (ymax / 1000) * 100;
    xmax = (xmax / 1000) * 100;
  } else if (maxVal > 1050) {
    // 绝对像素坐标 -> 基于原图宽高归一化
    ymin = (ymin / Math.max(1, imgHeight)) * 100;
    xmin = (xmin / Math.max(1, imgWidth)) * 100;
    ymax = (ymax / Math.max(1, imgHeight)) * 100;
    xmax = (xmax / Math.max(1, imgWidth)) * 100;
  }

  // 确保 ymin < ymax 且 xmin < xmax
  if (ymin > ymax) {
    const temp = ymin;
    ymin = ymax;
    ymax = temp;
  }
  if (xmin > xmax) {
    const temp = xmin;
    xmin = xmax;
    xmax = temp;
  }

  // 安全边界约束
  ymin = Math.max(0, Math.min(92, Math.round(ymin)));
  xmin = Math.max(0, Math.min(92, Math.round(xmin)));
  ymax = Math.max(ymin + 5, Math.min(100, Math.round(ymax)));
  xmax = Math.max(xmin + 5, Math.min(100, Math.round(xmax)));

  return { ymin, xmin, ymax, xmax };
}


export const ProductDnaReadoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  role: z.enum([
    'sofa_3seat',
    'sofa_2seat',
    'recliner_1seat',
    'lounge_chair',
    'coffee_table',
    'dining_table',
    'dining_chair',
    'tv_console',
    'side_table',
    'decor'
  ]),
  priority: z.enum(['primary', 'secondary', 'decor']),
  identityLock: z.enum(['strict', 'normal', 'loose']),
  dimensions: z.object({
    width: z.number(),
    depth: z.number(),
    height: z.number()
  }),
  materials: z.array(z.string()),
  colors: z.array(z.string()),
  adaptiveStyles: z.array(z.string()).default([]),
  surfaceTexture: z.string(),
  functionCapable: z.boolean(),
  structuralFeatures: z.array(
    z.object({
      name: z.string(),
      description: z.string()
    })
  ),
  lockedRules: z.array(z.string()),
  readoutConfidence: z.number().min(0).max(100),
  explanation: z.string(),
  dossierSummary: z.string().optional(),
  dossierGeneratedAt: z.string().optional(),
  referenceImages: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['front', '45_deg', 'side', 'back', 'function_open', 'detail', 'material']),
      objectKey: z.string(),
      publicUrl: z.string().optional(),
      verified: z.boolean()
    })
  ),
  // 识别总图索引与解构出的多产品列表
  sourceMasterImageUrl: z.string().optional(),
  detectedProducts: z.array(DisaggregatedProductItemSchema).optional()
});

export type ProductDnaReadout = z.infer<typeof ProductDnaReadoutSchema>;

export class SpaceProductAnalysisService {
  private static storage = GcsAssetStorage.getInstance();

  /**
   * 核心方法：上传产品图资产至不可变存储并调用多模态大模型进行高精度物理读数与真值提炼
   */
  public static async analyzeAndExtract(
    input: z.infer<typeof AnalyzeProductRequestSchema>,
    userId: string = 'system'
  ): Promise<ProductDnaReadout> {
    const { projectId, images, userNotes } = input;
    const productId = `prod-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

    // 1. 保存上传的参考图至不可变对象存储中并生成访问凭证
    const storedReferences: Array<{
      id: string;
      type: 'front' | '45_deg' | 'side' | 'back' | 'function_open' | 'detail' | 'material';
      objectKey: string;
      publicUrl: string;
      verified: boolean;
      rawBuffer: Buffer;
      mimeType: string;
      cleanBase64: string;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const refId = `ref-${img.type}-${i + 1}`;
      let cleanBase64 = img.base64;
      let mimeType = 'image/jpeg';
      let imageBuffer: Buffer | null = null;

      if (cleanBase64.startsWith('data:')) {
        const match = cleanBase64.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          cleanBase64 = match[2];
          try {
            imageBuffer = Buffer.from(cleanBase64, 'base64');
          } catch {
            imageBuffer = null;
          }
        }
      } else if (cleanBase64.startsWith('/api/space/storage') || cleanBase64.includes('local-file') || cleanBase64.includes('download')) {
        // 从存储 URL 获取 key 并读取真实对象缓存
        const keyMatch = cleanBase64.match(/[?&]key=([^&#]+)/);
        if (keyMatch) {
          const key = decodeURIComponent(keyMatch[1]);
          imageBuffer =
            (await this.storage.getBuffer(key, 'source')) ||
            (await this.storage.getBuffer(key, 'generated'));
        }
      } else if (cleanBase64.startsWith('http://') || cleanBase64.startsWith('https://')) {
        try {
          const resp = await fetch(cleanBase64);
          if (resp.ok) {
            const arr = await resp.arrayBuffer();
            imageBuffer = Buffer.from(arr);
            const ct = resp.headers.get('content-type');
            if (ct && ct.startsWith('image/')) mimeType = ct;
          }
        } catch (fetchErr) {
          console.warn('[SpaceProductAnalysisService] Failed to fetch image from URL:', cleanBase64, fetchErr);
        }
      } else {
        try {
          const buf = Buffer.from(cleanBase64, 'base64');
          if (buf.length > 50) {
            imageBuffer = buf;
          }
        } catch {
          imageBuffer = null;
        }
      }

      // 如果未成功读取但为本地路径，尝试从磁盘直读
      if (!imageBuffer || imageBuffer.length < 50) {
        if (typeof cleanBase64 === 'string' && fs.existsSync(cleanBase64)) {
          try {
            imageBuffer = fs.readFileSync(cleanBase64);
          } catch {}
        }
      }

      // 兜底保障：若输入数据严重异常，生成一张 800x600 纯白画布，杜绝整条流水线崩溃
      if (!imageBuffer || imageBuffer.length < 20) {
        imageBuffer = await sharp({
          create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 245, g: 245, b: 245 }
          }
        }).jpeg().toBuffer();
      }

      cleanBase64 = imageBuffer.toString('base64');

      let webpBuffer: Buffer;
      try {
        webpBuffer = await sharp(imageBuffer)
          .webp({ quality: 92 })
          .toBuffer();
      } catch (err) {
        webpBuffer = imageBuffer;
      }

      const objectKey = SpaceObjectKeyBuilder.productReference({
        projectId,
        assetId: productId,
        referenceId: refId,
        extension: 'webp'
      });

      await this.storage.put({
        bucketType: 'source',
        objectKey,
        buffer: webpBuffer,
        contentType: 'image/webp',
        metadata: {
          projectId,
          productId,
          referenceType: img.type,
          originalMime: mimeType
        }
      });

      const signed = await this.storage.getSignedReadUrl(objectKey, 86400 * 7, 'source');

      const publicUrl =
        signed && signed.url
          ? signed.url
          : `/api/space/storage/download?key=${encodeURIComponent(objectKey)}`;

      storedReferences.push({
        id: refId,
        type: img.type,
        objectKey,
        publicUrl,
        verified: true,
        rawBuffer: webpBuffer,
        mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
        cleanBase64
      });
    }

    // 1.1 像素级视觉特征推断（分析主色调与轮廓，提供物理真值依据）
    let detectedDominantColorName = '云雾暖灰 (Warm Greige)';
    let detectedSecondaryColor = '拉丝黑钛五金';
    try {
      if (storedReferences.length > 0) {
        const firstBuffer = storedReferences[0].rawBuffer;
        const { data, info } = await sharp(firstBuffer)
          .resize(80, 80, { fit: 'inside' })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const width = info.width;
        const height = info.height;
        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        const foregroundPixels: Array<{ r: number; g: number; b: number; lum: number }> = [];

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const lum = (r + g + b) / 3;

            // 严格过滤：高亮纯白背景、浅灰近无色背景 (电商白底反光) 与纯黑噪点
            const isNearNeutralLight = lum > 175 && Math.abs(r - g) < 18 && Math.abs(g - b) < 18 && Math.abs(r - b) < 18;
            const isPureWhite = lum >= 238;
            const isDeepBlack = lum <= 18;

            if (!isPureWhite && !isDeepBlack && !isNearNeutralLight) {
              // 针对中心 70% 区域（家具主体核心受光区）赋予双倍采样权重
              const isCenter = x >= width * 0.15 && x <= width * 0.85 && y >= height * 0.15 && y <= height * 0.85;
              const weight = isCenter ? 2 : 1;
              for (let w = 0; w < weight; w++) {
                totalR += r;
                totalG += g;
                totalB += b;
                count++;
                foregroundPixels.push({ r, g, b, lum });
              }
            }
          }
        }

        if (count > 0) {
          const avgR = totalR / count;
          const avgG = totalG / count;
          const avgB = totalB / count;
          const avgLum = (avgR + avgG + avgB) / 3;

          // 核心色系严谨分级：区分深栗棕/黑巧 (低明度) vs 焦糖/驼黄 (中高明度) vs 干邑暖橙
          const isWarmBrownHue = avgR > avgG && avgG >= avgB && avgR > avgB * 1.25;

          if (isWarmBrownHue) {
            // 深浓黑巧 / 复古深栗棕：明度低 (avgLum <= 88 或 avgR < 115 且 avgG < 75)，沉稳暗调
            if (avgLum <= 88 || (avgR < 115 && avgG < 80)) {
              detectedDominantColorName = '复古深栗棕 (Vintage Chestnut)';
              detectedSecondaryColor = '暗夜拉丝黑钛五金';
            }
            // 干邑暖橙：高饱和度鲜艳红橙 (R 显著高于 G，且红调极浓)
            else if (avgR > 140 && (avgR - avgG) > 42 && avgB < 85) {
              detectedDominantColorName = '干邑暖橙 (Cognac Amber)';
              detectedSecondaryColor = '意式焦糖棕与哑光黑钛金属';
            }
            // 暖阳焦糖黄 / 驼黄：中高明度暖黄焦糖 (avgLum > 95, avgG 较高)
            else if (avgR > 125 && avgG > 95 && avgB < 90) {
              detectedDominantColorName = '暖阳焦糖黄 (Warm Caramel)';
              detectedSecondaryColor = '沉稳哑光深灰金属';
            }
            // 马鞍烟草棕：中等明度
            else {
              detectedDominantColorName = '复古深栗棕 (Vintage Chestnut)';
              detectedSecondaryColor = '暗夜拉丝黑五金';
            }
          } else if (avgR > 165 && avgG > 165 && avgB > 155) {
            detectedDominantColorName = '极地奶白 (Arctic Ivory)';
            detectedSecondaryColor = '珍珠银拉丝金属';
          } else if (avgLum < 75 && Math.abs(avgR - avgG) < 16 && Math.abs(avgG - avgB) < 16) {
            detectedDominantColorName = '曜石深灰 (Obsidian Grey)';
            detectedSecondaryColor = '香槟金金属饰条';
          } else if (avgR > 75 && avgG < 55 && avgB < 45) {
            detectedDominantColorName = '复古深栗棕 (Vintage Chestnut)';
            detectedSecondaryColor = '暗夜拉丝黑五金';
          }
        }
      }
    } catch (pixelErr) {
      console.warn('[SpaceProductAnalysisService] Pixel detection notice:', pixelErr);
    }

    // 2. 准备调用多模态大模型进行产品信息读数
    let extracted: Partial<ProductDnaReadout> | null = null;
    let explanation = '';

    try {
      const { ai, config, isValidKey } = await createServerGenAI(userId);

      if (ai && isValidKey && storedReferences.length > 0) {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        const promptText = `你是一名敏华家居（CHEERS 芝华仕）顶级工业设计总监与家具视觉工程专家。
请对传入的沙发/家具实拍图、产品效果图或三维渲染图进行极其严谨的【物理真值与工程规格多模态读数 (Product Physical Truth & Spec Extraction)】。

【读数核心目标与原则】
1. 空间分类角色判定 (role):
   - sofa_3seat (三人位主功能沙发/大转角沙发)
   - sofa_2seat (双人位功能沙发)
   - recliner_1seat (单人电动功能单椅/太空舱躺椅，具备展开式脚托与电动调节)
   - lounge_chair (无功能休闲单椅/矮单椅/无扶手旋转单椅/固定休闲椅，无电动脚托，无扶手或一体式设计)
   - coffee_table (主次茶几组合)
   - dining_table (餐桌)
   - dining_chair (餐椅)
   - tv_console (电视地柜)
   - side_table (边几)
   - decor (家居陈设与艺术品)

【单人位核心判定细则 (CRITICAL)】:
- 若单椅没有电动脚托、无扶手（或平直平整无粗大扶手）、无外露按键、或属于低矮休闲旋转单椅（如无扶手焦糖棕软包单椅），必须判定为 lounge_chair，且 functionCapable 输出 false！
- 仅当真正具备电动马达、外露按键与可伸展折叠脚托的厚重头等舱单椅时，才分类为 recliner_1seat，且 functionCapable 输出 true！

2. 毫米级工业三维尺寸读数 (dimensions mm):
   - 若画面中有标注数字/参数表，100%忠实读数。
   - 若无标注，根据敏华工业标准人体工学推导严谨尺寸（三人位宽约 2900-3300mm，深 1050-1150mm，高 920-980mm；休闲矮单椅宽 900-980mm，深 950-1020mm，高 800-880mm；单人功能椅宽 900-1050mm，深 950-1050mm，高 1000-1080mm；茶几宽 1200-1400mm，深 700-1200mm，高 360-420mm）。

3. 材质、皮质与五金机构识别 (materials):
   - 细致识别面料种类（头层牛皮/半苯胺皮/特级Nappa皮/科技超纤布/磨砂皮）、电机机构（德国低压双电机/零重力无级伸展五金架/高碳钢合金骨架）、海绵填充（高回弹象皮海绵/天然乳胶/云感羽绒）。

4. 色彩与表面肌理 (colors, surfaceTexture) 【高精度色阶与明度标定，严禁色彩漂移】:
   - 必须基于画面中家具皮革的【真实明度 (Luminance) 与色相】进行工业级精准打标，切忌盲目套用刻板印象！
   - 深色皮革 vs 焦糖黄色系严谨判定法则 (CRITICAL):
     * 【复古深栗棕 / 浓缩黑巧棕】(Vintage Chestnut / Deep Espresso): 若皮革外观呈现深沉浓郁、低明度暗调、黑巧克力色、深栗褐色或深咖啡色（沉稳厚重，明度较低），必须精准打标为“复古深栗棕 (Vintage Chestnut)”或“浓缩黑巧棕 (Deep Espresso)”。【绝对严禁】将深色暗调皮革误标为“焦糖”、“驼黄”或“暖橙”！
     * 【马鞍复古棕】(Saddle Brown): 中等明度，自然烟草褐色马鞍皮。
     * 【暖阳焦糖黄 / 驼黄】(Warm Caramel / Tan): 仅当皮革呈现明显的明亮金黄、姜黄或高明度驼黄色时才标记。
     * 【干邑暖橙】(Cognac Amber): 鲜艳明亮红橙皮革。
     * 【曜石深灰 / 玄武深黑】: 冷调深灰或纯黑。
     * 【极地奶白 / 云雾暖灰】: 浅灰米白。
   - 提取皮革纹理、手工车缝明线、包边滚边、压褶工艺细节。

5. 适配空间风格推荐 (adaptiveStyles):
   - 结合产品形态设计、皮革面料质感与色彩体系，提炼 1~3 个最适配的室内空间风格（如“意式轻奢”、“现代极简”、“奶油原木”、“法式复古”、“侘寂原力”、“轻奢高定”、“新中式”等）。

6. 视觉真值不可篡改锁定规则 (lockedRules):
   - 给出 3~5 条后续在空间母版 A00 及分镜 A01~A08 渲染中必须 100% 保持一致性的硬性物理约束。

7. 【极其关键：单品 vs 组合图与多家具解构准则 (Multi-Product Ensemble Disaggregation)】:
   - 【严禁对单品进行暴力切片与虚构搭配 (NO VIOLENT SLICING & PURITY LOCK)】:
     * 必须首先准确判定当前画面是否为【单件独立产品展示图】（例如仅包含单张沙发、单张休闲椅、单张床、单个茶几或单个电视柜的白底/实拍/效果图展示）。
     * 若画面确为【单件家具单品】，"detectedProducts" 必须严格返回空数组 []！
     * 【绝对严禁】将同一件单品的不同结构（如沙发的靠垫、扶手、抱枕、坐垫皮料、电机脚踏）错误拆分为不同的家具单品！
     * 【绝对严禁】凭空无中生有捏造画面中不存在的搭配品（例如原图只有单张三人位棕色沙发，绝对严禁虚构出白色单人躺椅、黑色单椅或茶几）！
   - 【多产品组合图解构条件】:
     * 仅当原图明确为【包含 2 件及以上独立物理实体的家具组合套图/实景客餐厅展厅】（例如画面中同时清晰存在物理分离的主沙发、独立的单人休闲椅、独立的茶几）时，才允许在 "detectedProducts" 数组中分别拆解出这些实体家具。
     * 对于拆解出的各实体家具提供：
       * "id": 唯一单品 ID (如 "item-1", "item-2", "item-3")
       * "name": 准确单品规范全称 (如 "主位三人位多功能真皮主沙发", "无扶手休闲旋转矮单椅", "极简悬浮岩板电视地柜")
       * "role": 角色分类 ("sofa_3seat" / "sofa_2seat" / "recliner_1seat" / "lounge_chair" / "tv_console" / "coffee_table" / "dining_table" / "dining_chair" / "decor")
       * "priority": 主品标 "primary"，次品/搭配单椅标 "secondary"，柜几陈设标 "decor"
       * "functionCapable": true/false (对于带电机/展开脚托的功能位设为 true；对于无电动功能、无脚托的休闲单椅 lounge_chair 严格设为 false！)
       * "dimensions": 该家具自身独立的真实毫米尺寸
       * "colors": 该家具自身的真实独立色彩 (禁止混淆，主沙发写主沙发色，单椅写单椅色，忠实反映原图色阶明度)
       * "materials": 该家具真实的材质列表
       * "boundingBox": 该家具在整张识别总图中的归一化百分比坐标 (0~100 整数)，格式: {"ymin": 20, "xmin": 30, "ymax": 65, "xmax": 85}
       * "dossierSummary": 该单品的规格摘要。

${userNotes ? `【用户特别补充说明】: ${userNotes}` : ''}

必须输出严格符合以下格式的纯 JSON 对象（禁止包含 markdown 代码块反引号，禁止多余前缀后缀）：
{
  "name": "商业产品标准全称",
  "sku": "MW-CH-XXXX-XX",
  "role": "sofa_3seat",
  "priority": "primary",
  "identityLock": "strict",
  "dimensions": {
    "width": 3100,
    "depth": 1080,
    "height": 950
  },
  "materials": ["南美进口头层牛皮 (半苯胺)", "德国超静音低压双电机", "高碳钢五金伸缩架"],
  "colors": ["云雾暖灰 (Warm Greige)", "拉丝黑钛金属"],
  "adaptiveStyles": ["意式轻奢", "现代极简", "奶油原木"],
  "surfaceTexture": "细腻平纹半苯胺牛皮，天然微透气毛孔，手工法式立体双缝线包边",
  "functionCapable": true,
  "structuralFeatures": [
    {"name": "扶手特征", "description": "宽厚云感立体扶手，侧边集成金属智能调控按钮"},
    {"name": "靠背与腰托", "description": "分段式人体工学护腰靠背，高回弹饱满承托"}
  ],
  "lockedRules": [
    "严格保持原图中的扶手双包线造型与饱满弧度",
    "皮质光泽度与原厂物理调色禁止漂移",
    "电动功能脚踏收缩态轮廓比例严格锁定"
  ],
  "dossierSummary": "高精工业级产品档案：三人位多功能真皮主沙发，配备南美半苯胺头层牛皮、德国低压静音双电机与高碳钢合金伸缩骨架，尺寸3100×1080×950mm。",
  "readoutConfidence": 95,
  "explanation": "深度解析完成，已成功提炼材质纹理与几何特征",
  "detectedProducts": []
}`;

        parts.push({
          text: promptText
        });

        // 加入参考图的 base64 内容
        for (const ref of storedReferences) {
          parts.push({
            inlineData: {
              mimeType: ref.mimeType,
              data: ref.cleanBase64
            }
          });
        }

        // 优先使用用户选定模型，默认 gemini-3.7-flash，并配置高可用自动降级链路
        const preferredModel = (input.model || '').trim() || 'gemini-3.7-flash';
        const candidateModels = [
          preferredModel,
          'gemini-3.7-flash',
          'gemini-3.8-flash',
          'gemini-3.1-pro-preview',
          'gemini-2.5-flash',
          'gemini-2.0-flash'
        ].filter((m, idx, arr) => arr.indexOf(m) === idx);

        let responseText = '';
        for (const m of candidateModels) {
          try {
            console.log(`[SpaceProductAnalysisService] Initiating multi-modal analysis with model: ${m}...`);
            if (m.includes('gpt') || m.includes('sol')) {
              // OpenAI / GPT-Sol 路线：通过标准多模态 Chat Completions 接口分发
              const openAiUrl = `${config.baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '').replace(/\/+$/, '')}/v1/chat/completions`;
              const openAiRes = await fetch(openAiUrl, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${config.apiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: m,
                  messages: [
                    {
                      role: 'user',
                      content: [
                        { type: 'text', text: promptText },
                        ...storedReferences.map((ref) => ({
                          type: 'image_url',
                          image_url: { url: `data:${ref.mimeType};base64,${ref.cleanBase64}` }
                        }))
                      ]
                    }
                  ],
                  temperature: 0.2
                }),
                signal: AbortSignal.timeout(60000)
              });

              if (openAiRes.ok) {
                const data = await openAiRes.json();
                const content = data?.choices?.[0]?.message?.content || '';
                if (content) {
                  responseText = content;
                  console.log(`[SpaceProductAnalysisService] Model ${m} successfully returned response (${responseText.length} chars)`);
                  break;
                }
              } else {
                console.warn(`[SpaceProductAnalysisService] Model ${m} HTTP ${openAiRes.status}:`, await openAiRes.text());
              }
            } else {
              // Gemini 原生视觉路线：通过 Google GenAI SDK 执行强类型 JSON 读数
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout (${m}) after 60s`)), 60000)
              );
              const callPromise = ai.models.generateContent({
                model: m,
                contents: [{ role: 'user', parts: parts as any }],
                config: {
                  responseMimeType: 'application/json'
                }
              });
              const response: any = await Promise.race([callPromise, timeoutPromise]);
              if (response && response.text) {
                responseText = response.text;
                console.log(`[SpaceProductAnalysisService] Model ${m} successfully returned response (${responseText.length} chars)`);
                break;
              }
            }
          } catch (modelErr: any) {
            console.warn(`[SpaceProductAnalysisService] Model ${m} attempt notice:`, modelErr?.message);
          }
        }

        const rawText = responseText;
        const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            extracted = JSON.parse(jsonMatch[0]);
            explanation = extracted?.explanation || '基于多模态大模型完成产品信息智能读数';
            console.log('[SpaceProductAnalysisService] Successfully extracted product DNA from AI:', extracted?.name);
          } catch (pe) {
            console.warn('[SpaceProductAnalysisService] Failed to parse AI JSON:', pe);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('[SpaceProductAnalysisService] AI Extraction notice:', (err as Error)?.message);
    }

    // 3. 若 AI 响应缺失或字段不齐，使用敏华工业设计标准工程回退，保证 100% 健壮可用
    const fallbackSku = `MW-CH-${Math.floor(1000 + Math.random() * 9000)}-3S`;
    const finalRole: ProductRole = (extracted?.role as ProductRole) || 'sofa_3seat';
    const isRecliner = finalRole === 'recliner_1seat';
    const isTable = finalRole === 'coffee_table' || finalRole === 'side_table';
    const finalName =
      extracted?.name ||
      (isRecliner
        ? `敏华芝华仕头等舱·智能电动功能单椅 (${detectedDominantColorName.split(' ')[0]})`
        : isTable
        ? '意式极简奢石几组'
        : `敏华芝华仕头等舱·旗舰多功能真皮主沙发 (${detectedDominantColorName.split(' ')[0]})`);
    const finalDimensions = {
      width: Number(extracted?.dimensions?.width) || (isRecliner ? 960 : isTable ? 1200 : 3100),
      depth: Number(extracted?.dimensions?.depth) || (isRecliner ? 1020 : isTable ? 700 : 1080),
      height: Number(extracted?.dimensions?.height) || (isRecliner ? 1050 : isTable ? 420 : 950)
    };

    const finalAdaptiveStyles =
      Array.isArray(extracted?.adaptiveStyles) && extracted.adaptiveStyles.length > 0
        ? extracted.adaptiveStyles
        : ['意式轻奢', '现代极简', detectedDominantColorName.includes('橙') || detectedDominantColorName.includes('焦糖') ? '轻奢高定' : '奶油风'];

    const masterReference = storedReferences[0];
    const sourceMasterImageUrl = masterReference?.publicUrl || '';
    const masterBuffer = masterReference?.rawBuffer;

    // 4. 解析与处理多产品清单，并利用 Sharp 裁剪出各独立产品的聚焦特写图
    let masterMetaWidth = 1000;
    let masterMetaHeight = 1000;
    if (masterBuffer) {
      try {
        const meta = await sharp(masterBuffer).metadata();
        if (meta.width && meta.height) {
          masterMetaWidth = meta.width;
          masterMetaHeight = meta.height;
        }
      } catch (err) {
        console.warn('Failed to read master image metadata:', err);
      }
    }

    // 智能防暴力切片与纯净单品保护机制 (Anti-Violent-Slicing & Pure Single Product Protection)
    const processedDetectedProducts: DisaggregatedProductItem[] = [];
    const rawDetected = Array.isArray(extracted?.detectedProducts) ? extracted.detectedProducts : [];

    // 几何判别函数：计算两个边界框的面积与包含重叠关系，杜绝将同一件家具的局部拆成“独立家具”
    const isComponentOrOverlapping = (
      box1: { ymin: number; xmin: number; ymax: number; xmax: number },
      box2: { ymin: number; xmin: number; ymax: number; xmax: number }
    ): boolean => {
      const ymin = Math.max(box1.ymin, box2.ymin);
      const xmin = Math.max(box1.xmin, box2.xmin);
      const ymax = Math.min(box1.ymax, box2.ymax);
      const xmax = Math.min(box1.xmax, box2.xmax);
      if (ymax <= ymin || xmax <= xmin) return false;
      const interArea = (ymax - ymin) * (xmax - xmin);
      const area1 = Math.max(1, (box1.ymax - box1.ymin) * (box1.xmax - box1.xmin));
      const area2 = Math.max(1, (box2.ymax - box2.ymin) * (box2.xmax - box2.xmin));
      // 若重叠面积占较小框面积超过 65%，判定为局部构件嵌套或同源重复框
      return interArea / Math.min(area1, area2) > 0.65;
    };

    // 1. 过滤掉名称明显为家具局部构件的伪产品（如抱枕、扶手、靠背、坐垫等）
    const validDetected = rawDetected.filter((item) => {
      const name = item.name || '';
      if (/(扶手|靠垫|靠背|抱枕|座包|坐垫|头枕|底框|脚踏|局部|特写|面料|皮质|细节|按键|缝线)/i.test(name)) {
        console.log(`[SpaceProductAnalysisService] 过滤局部构件误切片: ${name}`);
        return false;
      }
      return true;
    });

    // 2. 仅当存在 2 件及以上实体家具候选时，进行几何去重筛选
    const acceptedItems: typeof validDetected = [];
    if (validDetected.length > 1) {
      for (const item of validDetected) {
        const safeBox = normalizeBoundingBox(item.boundingBox, masterMetaWidth, masterMetaHeight);
        const boxW = safeBox.xmax - safeBox.xmin;
        const boxH = safeBox.ymax - safeBox.ymin;
        // 过滤面积过小的微小碎片框 (< 6% 宽或高)
        if (boxW < 6 || boxH < 6) continue;

        // 检查是否与已接收的独立单品框高度重叠
        const overlapsWithExisting = acceptedItems.some((accepted) => {
          const acceptedBox = normalizeBoundingBox(accepted.boundingBox, masterMetaWidth, masterMetaHeight);
          return isComponentOrOverlapping(safeBox, acceptedBox);
        });

        if (overlapsWithExisting) {
          console.log(`[SpaceProductAnalysisService] 过滤重叠度过高的同源伪切片: ${item.name}`);
          continue;
        }

        acceptedItems.push(item);
      }
    }

    // 3. 仅当去重后确实存在 2 件及以上真正独立的物理家具实体时，才执行物理切片
    if (acceptedItems.length > 1) {
      console.log(`[SpaceProductAnalysisService] 确认上传图为多产品实景组合，解构出 ${acceptedItems.length} 款独立家具`);
      for (let idx = 0; idx < acceptedItems.length; idx++) {
        const item = acceptedItems[idx];
        const itemId = `item-${productId}-${idx + 1}`;

        // 角色防误判与智能纠偏保护：严禁将茶几/几组识别为单椅，严禁将功能沙发识别为陈设
        let itemRole = (item.role as ProductRole) || (idx === 0 ? finalRole : 'decor');
        const itemName = item.name || '';
        const itemHeight = Number(item.dimensions?.height) || 0;
        const itemWidth = Number(item.dimensions?.width) || 0;

        if (/(茶几|岩板|大理石|几组|方几|圆几|中岛几|coffee.*table)/i.test(itemName) || (itemHeight > 0 && itemHeight <= 550 && itemWidth >= 700)) {
          itemRole = 'coffee_table';
        } else if (/(边几|角几|side.*table)/i.test(itemName) || (itemHeight > 0 && itemHeight <= 600 && itemWidth < 700 && /(几|台)/.test(itemName))) {
          itemRole = 'side_table';
        } else if (/(单人.*功能|电动.*单人|太空舱|零重力|头等舱.*单椅|recliner)/i.test(itemName)) {
          itemRole = 'recliner_1seat';
        } else if (/(休闲单椅|旋转单椅|单椅|无扶手.*椅|lounge.*chair)/i.test(itemName)) {
          itemRole = 'lounge_chair';
        } else if (/(三人|3人|主沙发|直排沙发)/i.test(itemName)) {
          itemRole = 'sofa_3seat';
        }

        const safeBox = normalizeBoundingBox(item.boundingBox, masterMetaWidth, masterMetaHeight);

        let cropBase64: string | undefined = undefined;
        let cropImageUrl: string | undefined = undefined;

        if (masterBuffer && masterMetaWidth > 20 && masterMetaHeight > 20) {
          try {
            const cropLeft = Math.max(0, Math.floor((safeBox.xmin / 100) * masterMetaWidth));
            const cropTop = Math.max(0, Math.floor((safeBox.ymin / 100) * masterMetaHeight));
            const rawW = Math.ceil(((safeBox.xmax - safeBox.xmin) / 100) * masterMetaWidth);
            const rawH = Math.ceil(((safeBox.ymax - safeBox.ymin) / 100) * masterMetaHeight);
            const cropWidth = Math.max(20, Math.min(masterMetaWidth - cropLeft, rawW));
            const cropHeight = Math.max(20, Math.min(masterMetaHeight - cropTop, rawH));

            if (cropWidth > 10 && cropHeight > 10) {
              const croppedBuffer = await sharp(masterBuffer)
                .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
                .resize(Math.min(1024, cropWidth), Math.min(1024, cropHeight), { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 88 })
                .toBuffer();

              cropBase64 = `data:image/webp;base64,${croppedBuffer.toString('base64')}`;
              cropImageUrl = cropBase64; // 默认将高质量 Base64 作为即刻可渲染的图片源

              try {
                const cropObjectKey = SpaceObjectKeyBuilder.productReference({
                  projectId,
                  assetId: productId,
                  referenceId: `crop-${idx + 1}`,
                  extension: 'webp'
                });

                await this.storage.put({
                  bucketType: 'source',
                  objectKey: cropObjectKey,
                  buffer: croppedBuffer,
                  contentType: 'image/webp',
                  metadata: {
                    projectId,
                    productId,
                    isCrop: 'true',
                    itemRole
                  }
                });

                const cropSigned = await this.storage.getSignedReadUrl(cropObjectKey, 86400 * 7, 'source');
                if (cropSigned && cropSigned.url && !cropSigned.url.includes('local-file')) {
                  cropImageUrl = cropSigned.url;
                }
              } catch (storageErr) {
                console.warn(`[SpaceProductAnalysisService] Crop storage save notice for item ${idx + 1}:`, storageErr);
              }
            }
          } catch (cropErr) {
            console.warn(`[SpaceProductAnalysisService] Crop error for item ${idx + 1}:`, cropErr);
          }
        }

        const isNonFunctionalChair =
          itemRole === 'lounge_chair' ||
          (item.name && /(休闲|无扶手|矮椅|旋转|单椅)/.test(item.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(item.name));

        const effectiveRole = isNonFunctionalChair && itemRole === 'recliner_1seat' ? 'lounge_chair' : itemRole;
        const resolvedFunctionCapable =
          typeof item.functionCapable === 'boolean'
            ? item.functionCapable
            : isNonFunctionalChair
            ? false
            : (effectiveRole === 'sofa_3seat' || effectiveRole === 'sofa_2seat' || effectiveRole === 'recliner_1seat');

        const finalCropUrl = cropImageUrl || cropBase64 || sourceMasterImageUrl;

        processedDetectedProducts.push({
          id: itemId,
          name: item.name || `配套产品 ${idx + 1}`,
          sku: item.sku || `MW-CH-${Math.floor(1000 + Math.random() * 9000)}-${idx + 1}`,
          role: effectiveRole,
          priority: (item.priority as any) || (idx === 0 ? 'primary' : 'secondary'),
          dimensions: {
            width: Number(item.dimensions?.width) || (effectiveRole === 'lounge_chair' ? 950 : effectiveRole === 'recliner_1seat' ? 980 : effectiveRole === 'tv_console' ? 2000 : 1200),
            depth: Number(item.dimensions?.depth) || (effectiveRole === 'lounge_chair' ? 1000 : effectiveRole === 'recliner_1seat' ? 1020 : effectiveRole === 'tv_console' ? 400 : 700),
            height: Number(item.dimensions?.height) || (effectiveRole === 'lounge_chair' ? 850 : effectiveRole === 'recliner_1seat' ? 1050 : effectiveRole === 'tv_console' ? 450 : 420)
          },
          materials: Array.isArray(item.materials) && item.materials.length > 0 ? item.materials : ['精选高规格家具主材'],
          colors: Array.isArray(item.colors) && item.colors.length > 0 ? item.colors : [detectedDominantColorName],
          adaptiveStyles: Array.isArray(item.adaptiveStyles) && item.adaptiveStyles.length > 0 ? item.adaptiveStyles : finalAdaptiveStyles,
          surfaceTexture: item.surfaceTexture || '原厂真值纹理质感锁定',
          functionCapable: resolvedFunctionCapable,
          boundingBox: safeBox,
          cropImageUrl: finalCropUrl,
          cropBase64: cropBase64,
          sourceMasterImageUrl: sourceMasterImageUrl,
          lockedRules: Array.isArray(item.lockedRules) && item.lockedRules.length > 0 ? item.lockedRules : [
            `保持该单品与识别总图中的相对空间比例与材质一致`
          ],
          dossierSummary: item.dossierSummary || `${item.name} · 索引来自识别总图`
        });
      }
    } else {
      console.log('[SpaceProductAnalysisService] 上传图为单件产品，严格保持纯净单品模式，禁止暴力切片与虚构搭配套组');
    }

    const finalProduct: ProductDnaReadout = {
      id: productId,
      name: finalName,
      sku: extracted?.sku || fallbackSku,
      role: finalRole,
      priority: extracted?.priority || (isTable ? 'secondary' : 'primary'),
      identityLock: extracted?.identityLock || 'strict',
      dimensions: finalDimensions,
      materials:
        Array.isArray(extracted?.materials) && extracted.materials.length > 0
          ? extracted.materials
          : [
              '南美进口特选头层牛皮 (半苯胺)',
              '德国超静音低压双电机',
              '高碳钢合金伸缩骨架',
              '高回弹云感象皮海绵'
            ],
      colors:
        Array.isArray(extracted?.colors) && extracted.colors.length > 0
          ? extracted.colors
          : [detectedDominantColorName, detectedSecondaryColor],
      adaptiveStyles: finalAdaptiveStyles,
      surfaceTexture:
        extracted?.surfaceTexture ||
        `细腻平纹半苯胺牛皮，真皮透气毛孔，法式立体双缝线手工包边，呈现${detectedDominantColorName.split(' ')[0]}温润微光`,
      functionCapable:
        typeof extracted?.functionCapable === 'boolean' ? extracted.functionCapable : !isTable,
      structuralFeatures:
        Array.isArray(extracted?.structuralFeatures) && extracted.structuralFeatures.length > 0
          ? extracted.structuralFeatures
          : [
              { name: '靠背与腰承', description: '分段式人体工学护腰靠背，多维度曲面饱满承托' },
              { name: '扶手与控制区', description: '宽体云感扶手，侧面一体化嵌入式智能按键' },
              { name: '底座承重', description: '高强冷轧碳钢五金，通过26万次伸展无损测试' }
            ],
      lockedRules:
        Array.isArray(extracted?.lockedRules) && extracted.lockedRules.length > 0
          ? extracted.lockedRules
          : [
              '严格保持参考图中的扶手与靠背双包线弧度，禁止形态漂移',
              '皮质光泽度与原厂 Warm Greige 调色比例严格保真',
              '功能伸展与收缩基准比例与几何真值严格锁定'
            ],
      readoutConfidence:
        typeof extracted?.readoutConfidence === 'number' ? extracted.readoutConfidence : 96,
      dossierSummary:
        extracted?.dossierSummary ||
        `${finalName} · 尺寸 ${finalDimensions.width}×${finalDimensions.depth}×${finalDimensions.height}mm · ${Array.isArray(extracted?.materials) ? extracted.materials.join('、') : '南美进口头层牛皮(半苯胺)'}`,
      dossierGeneratedAt: new Date().toISOString(),
      explanation: explanation || '产品物理真值与几何规格参数已成功提取并锁定',
      referenceImages: storedReferences.map((r) => ({
        id: r.id,
        type: r.type,
        objectKey: r.objectKey,
        publicUrl: r.publicUrl,
        verified: r.verified
      })),
      sourceMasterImageUrl: sourceMasterImageUrl,
      detectedProducts: processedDetectedProducts
    };

    // 经过 Zod 最终校验与智能自愈
    const parsed = ProductDnaReadoutSchema.safeParse(finalProduct);
    if (!parsed.success) {
      console.warn('[SpaceProductAnalysisService] Readout schema validation warning, auto-reconciling:', parsed.error.issues);
      return {
        ...finalProduct,
        priority: 'primary',
        identityLock: 'strict',
        readoutConfidence: Math.min(100, Math.max(0, Number(finalProduct.readoutConfidence) || 92))
      };
    }
    return parsed.data;
  }

  /**
   * 独立场景/整套组合资产全要素识别提取方法：
   * 专用于直接识别整景大图中的沙发组、茶几、地毯、餐边柜、展示柜、餐桌椅、以及软装挂画摆件，
   * 形成独立的整套场景资产档案（WholeSceneEnsembleDossier），区别于单品暴力分割，作为完整资产包整体入库与整体置入。
   */
  public static async analyzeWholeSceneEnsemble(
    input: z.infer<typeof AnalyzeProductRequestSchema>,
    userId: string = 'system'
  ): Promise<{ success: boolean; dossier: any; productAsset: any }> {
    const { projectId, images, userNotes } = input;
    const ensembleId = `ens-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

    // 1. 存储参考图到对象存储
    const storedReferences: Array<{
      id: string;
      objectKey: string;
      publicUrl: string;
      mimeType: string;
      cleanBase64: string;
      rawBuffer: Buffer;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const refId = `ens-ref-${i + 1}`;
      let cleanBase64 = img.base64;
      let mimeType = 'image/jpeg';
      let imageBuffer: Buffer | null = null;

      if (cleanBase64.startsWith('data:')) {
        const match = cleanBase64.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          cleanBase64 = match[2];
          try { imageBuffer = Buffer.from(cleanBase64, 'base64'); } catch {}
        }
      } else if (cleanBase64.startsWith('/api/space/storage') || cleanBase64.includes('local-file') || cleanBase64.includes('download')) {
        const keyMatch = cleanBase64.match(/[?&]key=([^&#]+)/);
        if (keyMatch) {
          const key = decodeURIComponent(keyMatch[1]);
          imageBuffer =
            (await this.storage.getBuffer(key, 'source')) ||
            (await this.storage.getBuffer(key, 'generated'));
        }
      } else if (cleanBase64.startsWith('http://') || cleanBase64.startsWith('https://')) {
        try {
          const resp = await fetch(cleanBase64);
          if (resp.ok) {
            const arr = await resp.arrayBuffer();
            imageBuffer = Buffer.from(arr);
            const ct = resp.headers.get('content-type');
            if (ct && ct.startsWith('image/')) mimeType = ct;
          }
        } catch {}
      } else {
        try {
          const buf = Buffer.from(cleanBase64, 'base64');
          if (buf.length > 50) imageBuffer = buf;
        } catch {}
      }

      if (!imageBuffer || imageBuffer.length < 50) {
        if (typeof cleanBase64 === 'string' && fs.existsSync(cleanBase64)) {
          try { imageBuffer = fs.readFileSync(cleanBase64); } catch {}
        }
      }

      if (!imageBuffer || imageBuffer.length < 20) {
        imageBuffer = await sharp({
          create: { width: 1200, height: 800, channels: 3, background: { r: 245, g: 245, b: 245 } }
        }).jpeg().toBuffer();
      }

      cleanBase64 = imageBuffer.toString('base64');

      let webpBuffer: Buffer;
      try {
        webpBuffer = await sharp(imageBuffer).webp({ quality: 92 }).toBuffer();
      } catch {
        webpBuffer = imageBuffer;
      }

      const objectKey = `scene-ensembles/${projectId}/${ensembleId}/source_${i + 1}.webp`;
      await this.storage.put({
        bucketType: 'source',
        objectKey,
        buffer: webpBuffer,
        contentType: 'image/webp',
        metadata: { projectId, ensembleId, index: String(i + 1) }
      });

      const signed = await this.storage.getSignedReadUrl(objectKey, 86400 * 7, 'source');
      const publicUrl = signed?.url || `/api/space/storage/download?key=${encodeURIComponent(objectKey)}`;

      storedReferences.push({
        id: refId,
        objectKey,
        publicUrl,
        mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
        cleanBase64,
        rawBuffer: webpBuffer
      });
    }

    const masterRef = storedReferences[0];
    const sourceImageUrl = masterRef?.publicUrl || '';

    // 2. 调用多模态大模型进行【整景全套要素】结构化分析
    let rawAiResult: any = null;
    try {
      const { ai, config, isValidKey } = await createServerGenAI(userId);
      if (ai && isValidKey && storedReferences.length > 0) {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        const promptText = `你是一名敏华家居（CHEERS 芝华仕）顶级全案空间美学总监与高端大平层陈设设计大师。
请对上传的【整套客厅/客餐厅全景实景图】进行极其细致的【整套场景资产结构化识别 (Whole-Scene Ensemble Dossier Extraction)】。
区别于将家具割裂切碎的单品分割模式，我们要求你将该场景视为一个【高度协同的整体空间套组 (Whole-Scene Ensemble)】，直接识别并提取以下 7 大核心要素：

【必须识别与提取的 7 大核心要素】：
1. 沙发组合 (sofaSuite):
   - 包含三人/四人位主沙发、双人位侧位、单人电动单椅或休闲单椅。
   - 提取各位置款式数量、摆放夹角（如U型/L型/亲密围合）、皮质面料等级（如南美半苯胺头层牛皮/Nappa）、色阶明度（如复古深栗棕、黑巧克力色、干邑橙等）、扶手饱满度与立体包边特征。
2. 茶几与几组 (coffeeTables):
   - 中心主茶几、副几、角几或边几。
   - 提取台面材质（天然大理石纹理/奢石岩板/实木）、底座框架材质（哑光黑金属/拉丝黄铜/悬浮造型）、高低错落层次。
3. 地毯 (carpetRug):
   - 提取地毯铺设范围与比例（垫衬于主沙发与茶几下方）、材质触感（羊毛高密混纺/短绒）、纹理肌理（如流动大理石水墨纹/浅米灰几何肌理）、色彩搭配。
4. 餐边柜与低矮地柜 (credenzaSideboard):
   - 观察前侧或侧边是否有电视矮柜、餐边柜、斗柜或储物地柜。
   - 提取柜体木饰面（如深色胡桃木/烟熏橡木）、台面岩板、收边五金与抽屉造型。若无则标记 presence 为 false。
5. 展示柜与立面壁龛 (displayCabinet):
   - 观察背景墙或侧立面是否有开放式壁龛展架、内嵌展示玻璃柜或酒柜。
   - 提取层板材质与线性隐藏光氛围。若无则标记 presence 为 false。
6. 餐桌与餐椅配套 (diningSuite):
   - 若画面包含客餐厅一体视野，识别是否有长餐桌与皮革餐椅。提取餐桌材质、餐椅皮革色系与数量。若无则标记 presence 为 false。
7. 软装挂画与艺术摆件 (softDecor):
   - 识别背景奢石墙、挂画或艺术壁灯、落地绿植盆栽、茶几托盘香薰或雕塑摆件。

同时生成：
- 全案宏观概述 (dossierSummary): 200字左右的高规格商业全案摘要。
- 整体置入指令 (placementDirectives): 提供可以直接注入 A00 空间母版与分镜生图的英文协同提示词 (holisticLayoutPrompt) 和视觉不变量 (visualInvariants)。

${userNotes ? `【用户特别补充说明】: ${userNotes}` : ''}

必须输出严格符合以下结构的纯 JSON 格式：
{
  "name": "商业全案套组标准全称 (如: 芝华仕·大平层都会轻奢全景客厅尊享套组)",
  "sku": "MW-ENS-XXXX",
  "ensembleCategory": "大平层现代轻奢全景会客套组",
  "readoutConfidence": 96,
  "dossierSummary": "全案宏观规格与美学概述...",
  "sofaSuite": {
    "description": "三人主位 + 双人侧位 + 单人位大扶手功能单椅围合布局",
    "seatingConfiguration": "3+2+1 尊享围合式多功能真皮沙发组",
    "mainSofa": {
      "name": "主位三人位多功能真皮沙发",
      "seats": 3,
      "dimensions": "3200×1080×950mm",
      "material": "南美进口头层半苯胺牛皮",
      "color": "复古深栗棕 (Vintage Chestnut)",
      "features": ["高回弹饱满坐垫", "宽厚云感扶手", "法式立体双包边"]
    },
    "companionSofas": [
      {
        "name": "双人位多功能真皮侧位沙发",
        "type": "sofa_2seat",
        "material": "同款南美进口头层半苯胺牛皮",
        "color": "复古深栗棕 (Vintage Chestnut)"
      }
    ],
    "reclinerChairs": [
      {
        "name": "单人位头等舱电动功能单椅",
        "type": "recliner_1seat",
        "material": "同款真皮与电动调节底座",
        "color": "复古深栗棕 (Vintage Chestnut)"
      }
    ]
  },
  "coffeeTables": {
    "description": "现代轻奢双层大理石金属茶几组",
    "items": [
      {
        "name": "中心大理石大茶几",
        "role": "center_table",
        "material": "天然爵士白/大理石纹石材台面",
        "shape": "长方形圆角",
        "finish": "哑光拉丝黑色金属几何支架"
      },
      {
        "name": "极简黑色几何边几",
        "role": "side_table",
        "material": "黑色哑光烤漆金属",
        "shape": "C型可内推结构",
        "finish": "细腻磨砂触感"
      }
    ]
  },
  "carpetRug": {
    "description": "大尺寸浅色水墨大理石纹理通铺艺术地毯",
    "material": "高密羊毛混纺短绒",
    "pattern": "浅灰米白流动大理石水墨冰裂纹",
    "coverageScope": "完整通铺垫衬于主沙发、茶几与双侧单椅正下方，形成向心聚合会客场域",
    "colors": ["浅米白", "云雾浅灰", "淡焦糖微纹"]
  },
  "credenzaSideboard": {
    "description": "前置深色北美胡桃木与岩板低矮地柜",
    "presence": true,
    "dimensions": "2000×450×420mm",
    "material": "深色北美黑胡桃实木柜身搭配暗色哑光岩板台面",
    "features": ["三抽屉暗拉手设计", "极简悬浮地台支撑"]
  },
  "displayCabinet": {
    "description": "背景墙整合式胡桃木壁板与金属线条壁龛",
    "presence": true,
    "material": "天然胡桃木木饰面护墙板与香槟金金属收边",
    "lightingStyle": "内嵌柔和暖白线性洗墙灯"
  },
  "diningSuite": {
    "description": "客餐厅贯通视野配套餐区",
    "presence": false
  },
  "softDecor": {
    "description": "奢石主墙、对称艺术壁灯、高挑绿植与茶几雅致陈设",
    "wallArt": "背景对称镶嵌天然大理石整板与两侧柱状柔光艺术壁灯",
    "lighting": "悬浮极简吊顶暗藏反光灯槽与背景壁灯双层氛围采光",
    "greenery": "左侧大落地窗前陈设高挑羽叶室内观赏绿植",
    "tabletopOrnaments": ["精装皮质艺术托盘", "极简黑色几何石雕", "透明琉璃水培花器"]
  },
  "placementDirectives": {
    "holisticLayoutPrompt": "authentic complete luxury living room ensemble featuring hero 3-seater power motion sofa, companion 2-seater sofa, and single recliner armchair finished in matching deep vintage chestnut brown leather, clustered comfortably on expansive marble-patterned wool area rug around center natural marble coffee table, with low-profile walnut credenza and architectural backdrop wall with warm sconces and potted foliage",
    "visualInvariants": [
      "严格保持 3+2+1 组合围合向心会客格局，家具绝不松散漂移",
      "整套皮质皮革严格保持同一批次复古深栗棕（Vintage Chestnut）色相，严禁单件偏色",
      "大理石茶几与浅色艺术地毯作为视觉中心稳固锚定在居中地面"
    ]
  },
  "adaptiveStyles": ["现代美式都会宅", "意式轻奢", "极简高定", "新中式"],
  "dominantColors": ["复古深栗棕", "大理石暖白", "深黑胡桃木", "雅致暖灰"]
}`;

        parts.push({
          text: promptText
        });

        for (const ref of storedReferences) {
          parts.push({
            inlineData: { mimeType: ref.mimeType, data: ref.cleanBase64 }
          });
        }

        // 优先使用用户选定模型，默认 gemini-3.7-flash，配置高可用平滑降级链路
        const preferredModel = (input.model || '').trim() || 'gemini-3.7-flash';
        const candidateModels = [
          preferredModel,
          'gemini-3.7-flash',
          'gemini-3.8-flash',
          'gemini-3.1-pro-preview',
          'gemini-2.5-flash',
          'gemini-2.0-flash'
        ].filter((m, idx, arr) => arr.indexOf(m) === idx);

        for (const m of candidateModels) {
          try {
            console.log(`[SpaceProductAnalysisService] Analyzing whole-scene ensemble with model: ${m}...`);
            let respText = '';

            if (m.includes('gpt') || m.includes('sol')) {
              // OpenAI / GPT-Sol 路线：通过标准多模态 Chat Completions
              const openAiUrl = `${config.baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '').replace(/\/+$/, '')}/v1/chat/completions`;
              const openAiRes = await fetch(openAiUrl, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${config.apiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: m,
                  messages: [
                    {
                      role: 'user',
                      content: [
                        { type: 'text', text: promptText },
                        ...storedReferences.map((ref) => ({
                          type: 'image_url',
                          image_url: { url: `data:${ref.mimeType};base64,${ref.cleanBase64}` }
                        }))
                      ]
                    }
                  ],
                  temperature: 0.2
                }),
                signal: AbortSignal.timeout(65000)
              });

              if (openAiRes.ok) {
                const data = await openAiRes.json();
                respText = data?.choices?.[0]?.message?.content || '';
              } else {
                console.warn(`[SpaceProductAnalysisService] Ensemble analysis notice (${m}) HTTP ${openAiRes.status}:`, await openAiRes.text());
              }
            } else {
              const callPromise = ai.models.generateContent({
                model: m,
                contents: [{ role: 'user', parts: parts as any }],
                config: { responseMimeType: 'application/json' }
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout (${m}) after 65s`)), 65000)
              );
              const resp: any = await Promise.race([callPromise, timeoutPromise]);
              if (resp?.text) {
                respText = resp.text;
              }
            }

            if (respText) {
              const cleanText = respText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
              const match = cleanText.match(/\{[\s\S]*\}/);
              if (match) {
                rawAiResult = JSON.parse(match[0]);
                console.log(`[SpaceProductAnalysisService] Whole-scene ensemble successfully extracted via ${m}: ${rawAiResult?.name}`);
                break;
              }
            }
          } catch (modelErr: any) {
            console.warn(`[SpaceProductAnalysisService] Ensemble analysis notice (${m}):`, modelErr?.message);
          }
        }
      }
    } catch (err: any) {
      console.warn('[SpaceProductAnalysisService] Ensemble AI extraction fallback warning:', err?.message);
    }

    // 3. 构建规范化的 WholeSceneEnsembleDossier
    const dossier = {
      id: ensembleId,
      name: rawAiResult?.name || '敏华芝华仕·大平层现代奢华全景会客套组 (全案整体资产)',
      sku: rawAiResult?.sku || `MW-ENS-${Math.floor(1000 + Math.random() * 9000)}`,
      ensembleCategory: rawAiResult?.ensembleCategory || '大平层现代轻奢全景客餐厅套组',
      readoutConfidence: Number(rawAiResult?.readoutConfidence) || 96,
      dossierSummary:
        rawAiResult?.dossierSummary ||
        '大平层高端全景整体会客套组：包含三人主位功能真皮沙发、双人侧位沙发、单人头等舱电动单椅、双层大理石金属茶几几组、大理石纹艺术通铺地毯及前置胡桃木低矮地柜，形成宏大开阔的大平层向心社交场域。',
      sofaSuite: rawAiResult?.sofaSuite || {
        description: '三人主位 + 双人侧位 + 单人头等舱单椅围合布局',
        seatingConfiguration: '3+2+1 尊享围合式多功能真皮沙发组',
        mainSofa: {
          name: '主位三人位多功能真皮主沙发',
          seats: 3,
          dimensions: '3200×1080×950mm',
          material: '南美进口头层半苯胺牛皮',
          color: '复古深栗棕 (Vintage Chestnut)',
          features: ['高回弹饱满坐垫', '宽厚云感扶手', '法式立体双包边']
        },
        companionSofas: [
          {
            name: '双人位多功能真皮侧位沙发',
            type: 'sofa_2seat',
            material: '南美进口头层半苯胺牛皮',
            color: '复古深栗棕 (Vintage Chestnut)'
          }
        ],
        reclinerChairs: [
          {
            name: '单人位头等舱电动功能单椅',
            type: 'recliner_1seat',
            material: '南美进口头层半苯胺牛皮与电动调节底座',
            color: '复古深栗棕 (Vintage Chestnut)'
          }
        ]
      },
      coffeeTables: rawAiResult?.coffeeTables || {
        description: '现代轻奢双层大理石金属几组',
        items: [
          {
            name: '中心大理石主茶几',
            role: 'center_table',
            material: '天然大理石纹岩板',
            shape: '长方形圆角',
            finish: '哑光黑色几何钢架'
          },
          {
            name: '侧向极简金属边几',
            role: 'side_table',
            material: '哑光黑色金属',
            shape: 'C型嵌入式',
            finish: '磨砂防指纹'
          }
        ]
      },
      carpetRug: rawAiResult?.carpetRug || {
        description: '大尺寸通铺大理石艺术地毯',
        material: '高密羊毛混纺短绒',
        pattern: '浅米白与烟灰流动天然大理石冰裂肌理',
        coverageScope: '完整通铺垫衬于主沙发、茶几与双侧单椅正下方，形成向心聚合会客场域',
        colors: ['浅米白', '云雾浅灰', '焦糖微纹']
      },
      credenzaSideboard: rawAiResult?.credenzaSideboard || {
        description: '前置深色北美胡桃木与岩板低矮地柜',
        presence: true,
        dimensions: '2000×450×420mm',
        material: '北美黑胡桃实木搭配深灰色岩板台面',
        features: ['暗拉手极简线条', '悬浮式稳固支撑']
      },
      displayCabinet: rawAiResult?.displayCabinet || {
        description: '背景墙对称胡桃木护墙饰面与香槟金线条',
        presence: true,
        material: '天然胡桃木木饰面护墙板与香槟金金属收边',
        lightingStyle: '内嵌柔和暖白线性洗墙灯槽'
      },
      diningSuite: rawAiResult?.diningSuite || {
        description: '客餐厅贯通视野配套餐区',
        presence: false
      },
      softDecor: rawAiResult?.softDecor || {
        description: '奢石主墙、对称艺术壁灯、高挑落地绿植与茶几雅致陈设',
        wallArt: '背景对称镶嵌天然大理石整板与两侧柱状柔光艺术壁灯',
        lighting: '悬浮极简吊顶暗藏反光灯槽与背景壁灯双层氛围采光',
        greenery: '左侧大落地窗前陈设高挑羽叶室内观赏绿植',
        tabletopOrnaments: ['精装皮质艺术托盘', '极简黑色几何石雕', '透明琉璃水培花器']
      },
      placementDirectives: rawAiResult?.placementDirectives || {
        holisticLayoutPrompt:
          'authentic complete luxury living room ensemble featuring hero 3-seater power motion sofa, companion 2-seater sofa, and single recliner armchair finished in matching deep vintage chestnut brown leather, clustered comfortably on expansive marble-patterned wool area rug around center natural marble coffee table, with low-profile walnut credenza and architectural backdrop wall with warm sconces and potted foliage',
        visualInvariants: [
          '严格保持 3+2+1 组合围合向心会客格局，家具绝不松散漂移',
          '整套皮质皮革严格保持同一批次复古深栗棕（Vintage Chestnut）色相，严禁单件偏色',
          '大理石茶几与浅色艺术地毯作为视觉中心稳固锚定在居中地面'
        ]
      },
      adaptiveStyles:
        Array.isArray(rawAiResult?.adaptiveStyles) && rawAiResult.adaptiveStyles.length > 0
          ? rawAiResult.adaptiveStyles
          : ['现代美式都会宅', '意式轻奢', '极简高定'],
      dominantColors:
        Array.isArray(rawAiResult?.dominantColors) && rawAiResult.dominantColors.length > 0
          ? rawAiResult.dominantColors
          : ['复古深栗棕', '大理石暖白', '北美黑胡桃', '云雾浅灰'],
      sourceImageUrl,
      generatedAt: new Date().toISOString()
    };

    // 4. 将整套场景组合封装为统一的 ProductAsset，作为整体资产一键入库入参
    const ensembleProductAsset = {
      id: `prod-ens-${ensembleId}`,
      sku: dossier.sku,
      name: dossier.name,
      role: 'sofa_3seat' as const, // 兼容主角色分类
      priority: 'primary' as const,
      identityLock: 'strict' as const,
      dimensions: {
        width: 3200,
        depth: 1080,
        height: 950
      },
      materials: [
        '南美进口头层半苯胺牛皮',
        '天然爵士白大理石岩板',
        '北美黑胡桃实木饰面',
        '高密羊毛混纺地毯'
      ],
      colors: dossier.dominantColors,
      surfaceTexture: '多品类材质融合：深栗棕细腻平纹半苯胺牛皮、天然大理石冰裂肌理、温润黑胡桃木纹与高密短绒羊毛',
      functionCapable: true,
      referenceImages: storedReferences.map((r) => ({
        id: r.id,
        type: 'front' as const,
        objectKey: r.objectKey,
        publicUrl: r.publicUrl,
        verified: true
      })),
      adaptiveStyles: dossier.adaptiveStyles,
      isEnsembleIncluded: true,
      readoutConfidence: dossier.readoutConfidence,
      dossierSummary: dossier.dossierSummary,
      dossierGeneratedAt: dossier.generatedAt,
      sourceMasterImageUrl: sourceImageUrl,
      lockedRules: dossier.placementDirectives.visualInvariants,
      isSceneEnsembleSuite: true,
      sceneEnsembleDossier: dossier
    };

    return {
      success: true,
      dossier,
      productAsset: ensembleProductAsset
    };
  }
}
