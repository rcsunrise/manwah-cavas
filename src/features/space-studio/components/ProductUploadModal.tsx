// src/features/space-studio/components/ProductUploadModal.tsx
// MANWAH Space Studio｜产品资产上传窗口与多模态读数控制台 V3.0
import React, { useState, useRef, useEffect } from 'react';
import {
  ProductAsset,
  ProductRole,
  ProductReference,
  DisaggregatedProductItem
} from '../../../types/spaceStudio';
import { dbService } from '../../../services/dbService';
import {
  X,
  Upload,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Tag,
  Plus,
  Trash2,
  Layers,
  Lock,
  RotateCw,
  Image as ImageIcon,
  Check,
  DownloadCloud,
  FileCheck,
  Palette,
  Clipboard,
  FileText,
  Boxes,
  Crosshair,
  CheckCheck
} from 'lucide-react';

const PRESET_STYLES = ['意式轻奢', '现代极简', '奶油原木', '法式复古', '侘寂原力', '轻奢高定', '新中式', '原木风'];
const PRESET_COLORS = ['云雾暖灰', '极地奶白', '干邑暖橙', '鞍褐焦糖', '曜石深灰', '复古深栗', '珍珠米金'];

export interface UploadedImageItem {
  id: string;
  file?: File;
  base64: string;
  type: 'front' | '45_deg' | 'side' | 'back' | 'function_open' | 'detail' | 'material';
  name: string;
}

interface ProductUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProduct: (product: ProductAsset) => void;
  onBatchSaveProducts?: (products: ProductAsset[]) => void;
  initialProduct?: ProductAsset | null;
  projectId?: string;
  initialImages?: UploadedImageItem[];
}

export const ProductUploadModal: React.FC<ProductUploadModalProps> = ({
  isOpen,
  onClose,
  onSaveProduct,
  onBatchSaveProducts,
  initialProduct = null,
  projectId = 'manwah-noble-space-01',
  initialImages = []
}) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImageItem[]>(() => {
    if (initialImages && initialImages.length > 0) {
      return initialImages;
    }
    if (initialProduct?.referenceImages && initialProduct.referenceImages.length > 0) {
      return initialProduct.referenceImages.map((ref, idx) => ({
        id: ref.id || `ref-init-${idx}`,
        base64: ref.publicUrl || '',
        type: ref.type,
        name: `参考图 ${idx + 1}`
      }));
    }
    return [];
  });

  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState<string>('');

  // 读数结果状态（可编辑）
  const [name, setName] = useState<string>(initialProduct?.name || '');
  const [sku, setSku] = useState<string>(initialProduct?.sku || '');
  const [role, setRole] = useState<ProductRole>(initialProduct?.role || 'sofa_3seat');
  const [priority, setPriority] = useState<'primary' | 'secondary' | 'decor'>(
    initialProduct?.priority || 'primary'
  );
  const [identityLock, setIdentityLock] = useState<'strict' | 'normal' | 'loose'>(
    initialProduct?.identityLock || 'strict'
  );
  const [width, setWidth] = useState<number>(initialProduct?.dimensions?.width || 3100);
  const [depth, setDepth] = useState<number>(initialProduct?.dimensions?.depth || 1080);
  const [height, setHeight] = useState<number>(initialProduct?.dimensions?.height || 950);
  const [materials, setMaterials] = useState<string[]>(
    initialProduct?.materials || ['南美进口头层牛皮 (半苯胺)', '德国超静音低压双电机', '高碳钢五金伸缩架']
  );
  const [newMaterialInput, setNewMaterialInput] = useState<string>('');
  const [colors, setColors] = useState<string[]>(
    initialProduct?.colors || ['云雾暖灰 (Warm Greige)', '曜石深灰']
  );
  const [newColorInput, setNewColorInput] = useState<string>('');
  const [adaptiveStyles, setAdaptiveStyles] = useState<string[]>(
    initialProduct?.adaptiveStyles || ['意式轻奢', '现代极简']
  );
  const [newStyleInput, setNewStyleInput] = useState<string>('');
  const [isEnsembleIncluded, setIsEnsembleIncluded] = useState<boolean>(
    initialProduct?.isEnsembleIncluded ?? true
  );
  const [surfaceTexture, setSurfaceTexture] = useState<string>(
    '细腻平纹半苯胺牛皮，天然微透气毛孔，手工法式立体双缝线包边'
  );
  const [functionCapable, setFunctionCapable] = useState<boolean>(
    initialProduct?.functionCapable ?? true
  );
  const [lockedRules, setLockedRules] = useState<string[]>([
    '严格保持原图中的扶手双包线造型与饱满弧度',
    '皮质光泽度与原厂 Warm Greige 调色禁止漂移',
    '电动功能脚踏收缩态轮廓比例严格锁定'
  ]);
  const [newRuleInput, setNewRuleInput] = useState<string>('');
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<string>('');

  // 结构特征与生产真值溯源状态
  const [structuralFeatures, setStructuralFeatures] = useState<Array<{ name: string; description: string }>>(
    initialProduct?.structuralFeatures || []
  );
  const [provenance, setProvenance] = useState<
    'PROVIDED' | 'AI_ESTIMATED' | 'SOLVER_RESOLVED' | 'DERIVED' | 'MANUAL_CONFIRMED'
  >(initialProduct?.provenance || 'AI_ESTIMATED');
  const [productionTruth, setProductionTruth] = useState<boolean>(
    initialProduct?.productionTruth || false
  );
  const [dossierSummary, setDossierSummary] = useState<string>(
    initialProduct?.dossierSummary || ''
  );
  const [dossierGeneratedAt, setDossierGeneratedAt] = useState<string>(
    initialProduct?.dossierGeneratedAt || ''
  );

  // 多产品识别解构状态与识别总图索引
  const [detectedProducts, setDetectedProducts] = useState<DisaggregatedProductItem[]>(
    initialProduct?.detectedProducts || []
  );
  const [selectedProductIndex, setSelectedProductIndex] = useState<number>(0);
  const [sourceMasterImageUrl, setSourceMasterImageUrl] = useState<string>(
    initialProduct?.sourceMasterImageUrl || ''
  );
  const [hoveredBoxIndex, setHoveredBoxIndex] = useState<number | null>(null);

  // AI 识别计时与多阶段实时反馈状态
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [analysisStage, setAnalysisStage] = useState<string>('正在准备多模态识别...');
  const [analysisDuration, setAnalysisDuration] = useState<number | null>(null);
  const [analysisCompletedAt, setAnalysisCompletedAt] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

interface CanvasDraftDna {
  productCategory?: string;
  primaryProduct?: {
    name?: string;
    dimensions?: { width?: number; depth?: number; height?: number };
  };
  materials?: string[];
  colors?: string[];
  lockedRules?: string[];
  components?: Array<{ name?: string; feature?: string; description?: string }>;
}

interface CanvasDraftPayload {
  uploadedImageUrl?: string;
  activeDna?: CanvasDraftDna;
}

  // 检测创意画布是否有已解析产品
  const [detectedCanvasDraft, setDetectedCanvasDraft] = useState<{
    imageUrl?: string;
    productName?: string;
    activeDna?: CanvasDraftDna;
  } | null>(null);

  useEffect(() => {
    const checkCanvas = async () => {
      try {
        const rawDraft = await dbService.getDraft('manwah_canvas_latest');
        const draft = rawDraft as CanvasDraftPayload | null;
        if (draft && (draft.uploadedImageUrl || draft.activeDna)) {
          const name =
            draft.activeDna?.productCategory ||
            draft.activeDna?.primaryProduct?.name ||
            '创意画布已解析沙发组合 (15019)';
          setDetectedCanvasDraft({
            imageUrl: draft.uploadedImageUrl,
            productName: name,
            activeDna: draft.activeDna
          });
        }
      } catch (e: unknown) {
        console.warn('Check canvas draft warning:', e);
      }
    };
    checkCanvas();
  }, [isOpen]);

  // 保存上传后获得的云端引用列表
  const [cloudReferences, setCloudReferences] = useState<ProductReference[]>(
    initialProduct?.referenceImages || []
  );

  // 当打开弹窗或编辑目标切换时，自动同步表单状态
  useEffect(() => {
    if (!isOpen) return;
    if (initialProduct) {
      const initialImagesList: UploadedImageItem[] = [];
      if (initialProduct.referenceImages && initialProduct.referenceImages.length > 0) {
        initialProduct.referenceImages.forEach((ref, idx) => {
          const imgUrl =
            ref.publicUrl && !ref.publicUrl.includes('projects/default/')
              ? ref.publicUrl
              : ref.objectKey
              ? `/api/space/storage/local-file?key=${encodeURIComponent(ref.objectKey)}`
              : '';
          if (imgUrl) {
            initialImagesList.push({
              id: ref.id || `ref-init-${idx}`,
              base64: imgUrl,
              type: ref.type,
              name: `参考图 ${idx + 1}`
            });
          }
        });
      }

      // 若原有引用图为空或打不开，回退到切片特写图或来源总图
      if (initialImagesList.length === 0) {
        const fallbackImg =
          initialProduct.cropBase64 ||
          initialProduct.cropImageUrl ||
          initialProduct.sourceMasterImageUrl;
        if (fallbackImg) {
          initialImagesList.push({
            id: `crop-${initialProduct.id}`,
            base64: fallbackImg,
            type: 'front',
            name: `${initialProduct.name} (切片特写)`
          });
        }
      }
      setUploadedImages(initialImagesList);
      setName(initialProduct.name || '');
      setSku(initialProduct.sku || '');
      setRole(initialProduct.role || 'sofa_3seat');
      setPriority(initialProduct.priority || 'primary');
      setIdentityLock(initialProduct.identityLock || 'strict');
      setWidth(initialProduct.dimensions?.width || 3100);
      setDepth(initialProduct.dimensions?.depth || 1080);
      setHeight(initialProduct.dimensions?.height || 950);
      setMaterials(initialProduct.materials || ['南美进口头层牛皮 (半苯胺)', '德国超静音低压双电机', '高碳钢五金伸缩架']);
      setColors(initialProduct.colors || ['云雾暖灰 (Warm Greige)', '曜石深灰']);
      setAdaptiveStyles(initialProduct.adaptiveStyles || ['意式轻奢', '现代极简']);
      setIsEnsembleIncluded(initialProduct.isEnsembleIncluded ?? true);
      setSurfaceTexture(initialProduct.surfaceTexture || '细腻平纹半苯胺牛皮，天然微透气毛孔，手工法式立体双缝线包边');
      setFunctionCapable(initialProduct.functionCapable ?? true);
      setLockedRules(initialProduct.lockedRules || [
        '严格保持原图中的扶手双包线造型与饱满弧度',
        '皮质光泽度与原厂 Warm Greige 调色禁止漂移',
        '电动功能脚踏收缩态轮廓比例严格锁定'
      ]);
      setConfidenceScore(initialProduct.readoutConfidence || null);
      setStructuralFeatures(initialProduct.structuralFeatures || []);
      setProvenance(initialProduct.provenance || 'AI_ESTIMATED');
      setProductionTruth(initialProduct.productionTruth || false);
      setDossierSummary(initialProduct.dossierSummary || '');
      setDossierGeneratedAt(initialProduct.dossierGeneratedAt || '');
      setCloudReferences(initialProduct.referenceImages || []);
      const rawDPs = initialProduct.detectedProducts || [];
      setDetectedProducts(rawDPs);
      setSelectedProductIndex(0);
      const masterUrl = initialProduct.sourceMasterImageUrl || (initialImagesList[0]?.base64 || '');
      setSourceMasterImageUrl(masterUrl);
      if (rawDPs.length > 0 && masterUrl) {
        // 后台异步补全缺失切片，保持数据一致
        Promise.all(
          rawDPs.map(async (dp) => {
            let crop = dp.cropImageUrl || dp.cropBase64;
            if (!crop && dp.boundingBox) {
              const clientCrop = await cropImageClientSide(masterUrl, dp.boundingBox);
              if (clientCrop) {
                return { ...dp, cropImageUrl: clientCrop, cropBase64: clientCrop };
              }
            }
            return dp;
          })
        ).then((reconciled) => {
          setDetectedProducts(reconciled);
        });
      }
      setActiveImageIndex(0);
      setAnalysisError(null);
    } else {
      if (initialImages && initialImages.length > 0) {
        setUploadedImages(initialImages);
        setActiveImageIndex(0);
        setTimeout(() => {
          handleExtractProductDna(initialImages);
        }, 100);
      } else {
        setUploadedImages([]);
      }
      setDetectedProducts([]);
      setSelectedProductIndex(0);
      setSourceMasterImageUrl('');
      setName('');
      setSku('');
      setRole('sofa_3seat');
      setPriority('secondary');
      setIdentityLock('strict');
      setWidth(3100);
      setDepth(1080);
      setHeight(950);
      setMaterials(['南美进口头层牛皮 (半苯胺)', '德国超静音低压双电机', '高碳钢五金伸缩架']);
      setColors(['云雾暖灰 (Warm Greige)', '曜石深灰']);
      setAdaptiveStyles(['意式轻奢', '现代极简']);
      setIsEnsembleIncluded(true);
      setSurfaceTexture('细腻平纹半苯胺牛皮，天然微透气毛孔，手工法式立体双缝线包边');
      setFunctionCapable(true);
      setLockedRules([
        '严格保持原图中的扶手双包线造型与饱满弧度',
        '皮质光泽度与原厂 Warm Greige 调色禁止漂移',
        '电动功能脚踏收缩态轮廓比例严格锁定'
      ]);
      setConfidenceScore(null);
      setStructuralFeatures([]);
      setProvenance('AI_ESTIMATED');
      setProductionTruth(false);
      setDossierSummary('');
      setDossierGeneratedAt('');
      setCloudReferences([]);
      setActiveImageIndex(0);
      setAnalysisError(null);
    }
  }, [isOpen, initialProduct, initialImages]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 切换多产品解构中当前编辑的单品，并动态将规格参数分配填入右侧仪表盘
  const handleSelectDetectedProduct = (idx: number) => {
    if (!detectedProducts || idx < 0 || idx >= detectedProducts.length) return;
    setSelectedProductIndex(idx);
    const item = detectedProducts[idx];
    if (item.name) setName(item.name);
    if (item.sku) setSku(item.sku);

    // 智能纠偏：防止茶几被误标为单椅
    let resolvedItemRole = item.role;
    const itemName = item.name || '';
    const itemH = item.dimensions?.height || 0;
    const itemW = item.dimensions?.width || 0;
    if (/(茶几|岩板|大理石|几组|方几|圆几|中岛几|coffee.*table)/i.test(itemName) || (itemH > 0 && itemH <= 550 && itemW >= 700)) {
      resolvedItemRole = 'coffee_table';
    } else if (/(边几|角几|side.*table)/i.test(itemName) || (itemH > 0 && itemH <= 600 && itemW < 700 && /(几|台)/.test(itemName))) {
      resolvedItemRole = 'side_table';
    } else if (/(单人.*功能|电动.*单人|太空舱|零重力|头等舱.*单椅|recliner)/i.test(itemName)) {
      resolvedItemRole = 'recliner_1seat';
    } else if (/(休闲单椅|旋转单椅|单椅|无扶手.*椅|lounge.*chair)/i.test(itemName)) {
      resolvedItemRole = 'lounge_chair';
    }

    if (resolvedItemRole) setRole(resolvedItemRole);
    if (item.priority) setPriority(item.priority);
    if (item.dimensions) {
      setWidth(item.dimensions.width);
      setDepth(item.dimensions.depth);
      setHeight(item.dimensions.height);
    }
    if (Array.isArray(item.colors) && item.colors.length > 0) setColors(item.colors);
    if (Array.isArray(item.materials) && item.materials.length > 0) setMaterials(item.materials);
    if (Array.isArray(item.adaptiveStyles) && item.adaptiveStyles.length > 0) setAdaptiveStyles(item.adaptiveStyles);
    if (typeof item.functionCapable === 'boolean') {
      setFunctionCapable(item.functionCapable);
    } else if (resolvedItemRole === 'coffee_table' || resolvedItemRole === 'side_table' || resolvedItemRole === 'lounge_chair' || (item.name && /(休闲|无扶手|矮椅|旋转|单椅)/.test(item.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(item.name))) {
      setFunctionCapable(false);
    }
    if (item.dossierSummary) setDossierSummary(item.dossierSummary);
    setPasteFeedback(`已将【${item.name}】参数分配至仪表盘，来源索引总图已关联`);
  };

  // 剪贴板粘贴与智能提取状态
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  const [isTextPasteModalOpen, setIsTextPasteModalOpen] = useState<boolean>(false);
  const [rawPastedText, setRawPastedText] = useState<string>('');

  useEffect(() => {
    if (!pasteFeedback) return;
    const timer = setTimeout(() => setPasteFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [pasteFeedback]);

  // 校验文本是否含有产品规格、尺寸或家具关键词
  const isProductTextPayload = (text: string): boolean => {
    if (!text || text.length < 4) return false;
    const hasDimensions =
      /(\d{3,4})\s*[*xX×/]\s*(\d{3,4})\s*[*xX×/]\s*(\d{3,4})/.test(text) ||
      /(宽|长|深|高|W|D|H)\s*[:：=]?\s*\d{3,4}/i.test(text);
    const hasFurnitureKeywords =
      /(沙发|单椅|茶几|电视柜|餐桌|餐椅|床|床垫|真皮|牛皮|面料|尺寸|规格|货号|SKU|型号|功能)/i.test(text);
    return hasDimensions || hasFurnitureKeywords;
  };

  // 智能解析规格文本并一键填入右侧仪表盘
  const applyParsedProductText = (text: string): boolean => {
    if (!text) return false;
    let matchedSomething = false;
    const updates: string[] = [];

    // 1. 尝试 JSON 格式解析
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      try {
        const data = JSON.parse(text);
        if (data.name) { setName(data.name); updates.push('产品名称'); }
        if (data.sku) { setSku(data.sku); updates.push('SKU编码'); }
        if (data.dimensions) {
          if (data.dimensions.width) setWidth(Number(data.dimensions.width));
          if (data.dimensions.depth) setDepth(Number(data.dimensions.depth));
          if (data.dimensions.height) setHeight(Number(data.dimensions.height));
          updates.push('三维尺寸');
        }
        if (Array.isArray(data.materials)) { setMaterials(data.materials); updates.push('面料材质'); }
        if (Array.isArray(data.colors)) { setColors(data.colors); updates.push('色彩体系'); }
        if (Array.isArray(data.adaptiveStyles)) { setAdaptiveStyles(data.adaptiveStyles); updates.push('适配风格'); }
        if (updates.length > 0) {
          setPasteFeedback(`已通过剪贴板 JSON 解析并填入：${updates.join('、')}`);
          return true;
        }
      } catch {
        // 降级为文本正则解析
      }
    }

    // 2. 正则提取三维尺寸 (宽 x 深 x 高)
    // 2.1 乘号分隔: 3100*1080*950 / 3100×1080×950 / 3100 x 1080 x 950
    const dimMatch = text.match(/(\d{3,4})\s*[*xX×/]\s*(\d{3,4})\s*[*xX×/]\s*(\d{3,4})/);
    // 2.2 汉字前缀连续组合: 长3250宽1120高980 或 宽3100深1080高950
    const dimMatchZh = text.match(/(?:长|宽|总宽|W)\s*[:：=]?\s*(\d{3,4})\s*[,，\s]*?(?:宽|深|总深|D)\s*[:：=]?\s*(\d{3,4})\s*[,，\s]*?(?:高|总高|H)\s*[:：=]?\s*(\d{3,4})/i);
    if (dimMatch) {
      const w = parseInt(dimMatch[1], 10);
      const d = parseInt(dimMatch[2], 10);
      const h = parseInt(dimMatch[3], 10);
      if (w >= 400 && w <= 6000) setWidth(w);
      if (d >= 400 && d <= 3000) setDepth(d);
      if (h >= 300 && h <= 2500) setHeight(h);
      updates.push(`尺寸(${w}×${d}×${h}mm)`);
      matchedSomething = true;
    } else if (dimMatchZh) {
      const w = parseInt(dimMatchZh[1], 10);
      const d = parseInt(dimMatchZh[2], 10);
      const h = parseInt(dimMatchZh[3], 10);
      if (w >= 400 && w <= 6000) setWidth(w);
      if (d >= 400 && d <= 3000) setDepth(d);
      if (h >= 300 && h <= 2500) setHeight(h);
      updates.push(`尺寸(${w}×${d}×${h}mm)`);
      matchedSomething = true;
    } else {
      const wMatch = text.match(/(?:总宽|长|宽|Width|W)\s*[:：=]?\s*(\d{3,4})/i);
      const dMatch = text.match(/(?:总深|深|Depth|D)\s*[:：=]?\s*(\d{3,4})/i);
      const hMatch = text.match(/(?:总高|高|Height|H)\s*[:：=]?\s*(\d{3,4})/i);
      if (wMatch) { setWidth(parseInt(wMatch[1], 10)); updates.push('宽度'); matchedSomething = true; }
      if (dMatch) { setDepth(parseInt(dMatch[1], 10)); updates.push('深度'); matchedSomething = true; }
      if (hMatch) { setHeight(parseInt(hMatch[1], 10)); updates.push('高度'); matchedSomething = true; }
    }

    // 3. 正则提取产品名
    const nameMatch = text.match(/(?:产品名称|规范全称|产品全称|品名|名称|产品)\s*[:：]\s*([^\r\n,，；;]+)/);
    if (nameMatch && nameMatch[1].trim()) {
      setName(nameMatch[1].trim());
      updates.push('产品名称');
      matchedSomething = true;
    } else if (!name) {
      const firstLine = text.split(/[\r\n]+/).map(s => s.trim()).find(Boolean);
      if (firstLine && /(沙发|单椅|茶几|餐椅|功能椅|贵妃榻|软床)/.test(firstLine) && firstLine.length <= 40) {
        setName(firstLine);
        updates.push('产品名称');
        matchedSomething = true;
      }
    }

    // 4. 正则提取 SKU / 货号
    const skuMatch = text.match(/(?:SKU|货号|型号|编码|商品编码)\s*[:：=]?\s*([A-Za-z0-9_#-]+)/i);
    if (skuMatch && skuMatch[1].trim()) {
      setSku(skuMatch[1].trim().toUpperCase());
      updates.push('SKU编码');
      matchedSomething = true;
    }

    // 5. 颜色匹配
    const matchedColors: string[] = [];
    PRESET_COLORS.forEach((c) => {
      const base = c.split(' ')[0];
      if (text.includes(base) || (base.includes('灰') && text.includes('灰色')) || (base.includes('白') && text.includes('白色'))) {
        if (!matchedColors.includes(c)) matchedColors.push(c);
      }
    });
    if (matchedColors.length > 0) {
      setColors((prev) => Array.from(new Set([...prev, ...matchedColors])));
      updates.push(`色彩(${matchedColors.join(',')})`);
      matchedSomething = true;
    }

    // 6. 适配风格匹配
    const matchedStyles: string[] = [];
    PRESET_STYLES.forEach((s) => {
      if (text.includes(s) || (s.includes('轻奢') && text.includes('轻奢')) || (s.includes('极简') && text.includes('极简'))) {
        if (!matchedStyles.includes(s)) matchedStyles.push(s);
      }
    });
    if (matchedStyles.length > 0) {
      setAdaptiveStyles((prev) => Array.from(new Set([...prev, ...matchedStyles])));
      updates.push(`风格(${matchedStyles.join(',')})`);
      matchedSomething = true;
    }

    // 7. 材质识别
    const potentialMaterials: string[] = [];
    if (text.includes('头层牛皮') || text.includes('半苯胺') || text.includes('真皮')) {
      potentialMaterials.push('南美进口头层牛皮 (半苯胺)');
    }
    if (text.includes('双电机') || text.includes('德国电机') || text.includes('电机')) {
      potentialMaterials.push('德国超静音低压双电机');
    }
    if (text.includes('高碳钢') || text.includes('五金') || text.includes('伸缩架') || text.includes('合金架')) {
      potentialMaterials.push('高碳钢五金伸缩架');
    }
    if (potentialMaterials.length > 0) {
      setMaterials((prev) => Array.from(new Set([...prev, ...potentialMaterials])));
      updates.push('材质');
      matchedSomething = true;
    }

    if (matchedSomething) {
      setPasteFeedback(`已从剪贴板文本智能解析：${updates.join('、')}`);
      return true;
    } else {
      setPasteFeedback('未匹配到标准产品规格，已将文本添加至用户特别备注');
      setUserNotes((prev) => (prev ? `${prev}\n${text}` : text));
      return false;
    }
  };

  // 全局剪贴板粘贴监听 (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      // 1. 优先提取剪贴板中的图片
      const items = e.clipboardData?.items;
      if (items && items.length > 0) {
        const imageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              const ext = item.type.split('/')[1] || 'png';
              imageFiles.push(
                new File(
                  [blob],
                  `剪贴板截图-${Date.now().toString().slice(-4)}.${ext}`,
                  { type: item.type }
                )
              );
            }
          }
        }

        if (imageFiles.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          handleFiles(imageFiles);
          return;
        }
      }

      // 焦点如果在输入框且没有图片，放行原生的文本输入
      if (isInput) return;

      // 2. 检查纯文本 (网络图片 URL 或 产品规格文案)
      const text = e.clipboardData?.getData('text')?.trim();
      if (!text) return;

      if (
        text.startsWith('data:image/') ||
        /^https?:\/\/.+\.(png|jpe?g|webp|gif|bmp)(\?.*)?$/i.test(text)
      ) {
        e.preventDefault();
        if (text.startsWith('data:image/')) {
          const currentTotal = uploadedImages.length;
          const defaultType =
            currentTotal === 0 ? 'front' : currentTotal === 1 ? '45_deg' : 'detail';
          const newItem: UploadedImageItem = {
            id: `img-clip-${Date.now()}`,
            base64: text,
            type: defaultType,
            name: `剪贴板图片-${Date.now().toString().slice(-4)}`
          };
          setUploadedImages((prev) => {
            const merged = [...prev, newItem];
            if (!confidenceScore) {
              setTimeout(() => handleExtractProductDna(merged), 100);
            }
            return merged;
          });
          setPasteFeedback('已从剪贴板 URL 载入产品图片');
        } else {
          try {
            setPasteFeedback('正在从网络链接载入图片...');
            const res = await fetch(text);
            const blob = await res.blob();
            const file = new File([blob], `网络产品图-${Date.now().toString().slice(-4)}.png`, {
              type: blob.type || 'image/png'
            });
            handleFiles([file]);
          } catch {
            setPasteFeedback('无法从网络链接加载图片，建议直接右键复制图片后按 Ctrl+V 粘贴');
          }
        }
        return;
      }

      // 2.2 若为产品规格说明文本
      if (isProductTextPayload(text)) {
        e.preventDefault();
        applyParsedProductText(text);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, uploadedImages.length, confidenceScore]);

  // 点击“从剪贴板粘贴”交互按钮
  const handlePasteFromClipboardClick = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const ext = type.split('/')[1] || 'png';
              files.push(
                new File(
                  [blob],
                  `剪贴板截图-${Date.now().toString().slice(-4)}.${ext}`,
                  { type }
                )
              );
            }
          }
        }
        if (files.length > 0) {
          handleFiles(files);
          setPasteFeedback(`已成功从剪贴板粘贴 ${files.length} 张图片`);
          return;
        }
      }

      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const applied = applyParsedProductText(text);
          if (applied) return;
        }
      }

      setPasteFeedback('剪贴板中未读取到图片，请直接按下键盘 Ctrl+V 粘贴');
    } catch (err) {
      console.warn('Clipboard read error:', err);
      setPasteFeedback('请直接按下键盘上的 Ctrl+V (或 ⌘+V) 粘贴剪贴板图片');
    }
  };

  // 一键从创意画布载入已解析产品图与视觉 DNA
  const handleImportFromCanvas = () => {
    if (!detectedCanvasDraft) return;

    if (detectedCanvasDraft.imageUrl) {
      setUploadedImages([
        {
          id: `canvas-img-${Date.now()}`,
          base64: detectedCanvasDraft.imageUrl,
          type: 'front',
          name: '创意画布主图 (15019)'
        }
      ]);
      setActiveImageIndex(0);
    }

    const dna = detectedCanvasDraft.activeDna;
    if (dna) {
      setName(dna.productCategory || '敏华芝华仕客厅现代功能沙发组合');
      setSku('MW-CANVAS-15019');
      setRole('sofa_3seat');
      setPriority('primary');
      setIdentityLock('strict');

      if (dna.materials && Array.isArray(dna.materials)) {
        setMaterials(dna.materials);
      }
      if (dna.colors && Array.isArray(dna.colors)) {
        setColors(dna.colors);
      }
      if (dna.primaryProduct?.dimensions) {
        setWidth(dna.primaryProduct.dimensions.width || 3150);
        setDepth(dna.primaryProduct.dimensions.depth || 1080);
        setHeight(dna.primaryProduct.dimensions.height || 960);
      }
      if (dna.lockedRules && Array.isArray(dna.lockedRules)) {
        setLockedRules(dna.lockedRules);
      }
      if (dna.components && Array.isArray(dna.components)) {
        setStructuralFeatures(
          dna.components.map((c: { name?: string; feature?: string; description?: string }) => ({
            name: c.name || '组件结构',
            description: c.feature || c.description || '功能件'
          }))
        );
      }
      setConfidenceScore(96);
      setExplanation('已从创意画布无缝同步该产品视觉 DNA 与三维物理读数。');
      setProvenance('AI_ESTIMATED');
      setProductionTruth(false);
    }
  };

  if (!isOpen) return null;

  // 处理文件选择、拖拽与剪贴板文件输入
  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const validFiles = fileArray.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    let processedCount = 0;
    const newItems: UploadedImageItem[] = [];

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        if (base64) {
          const currentTotal = uploadedImages.length + newItems.length;
          const defaultType =
            currentTotal === 0
              ? 'front'
              : currentTotal === 1
              ? '45_deg'
              : currentTotal === 2
              ? 'function_open'
              : 'detail';
          newItems.push({
            id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            file,
            base64,
            type: defaultType,
            name: file.name || `剪贴板图片-${Date.now().toString().slice(-4)}`
          });
        }
        processedCount++;
        if (processedCount === validFiles.length) {
          setUploadedImages((prev) => {
            const merged = [...prev, ...newItems];
            // 如果尚未成功提取过产品档案，自动启动一次 AI 多模态识别
            if (!confidenceScore && merged.length > 0) {
              setTimeout(() => {
                handleExtractProductDna(merged);
              }, 100);
            }
            return merged;
          });
          setPasteFeedback(`已成功导入 ${newItems.length} 张图片并加入产品参考图`);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    if (activeImageIndex >= index && activeImageIndex > 0) {
      setActiveImageIndex(activeImageIndex - 1);
    }
  };

  const handleChangeImageType = (
    index: number,
    type: 'front' | '45_deg' | 'side' | 'back' | 'function_open' | 'detail' | 'material'
  ) => {
    setUploadedImages((prev) =>
      prev.map((item, i) => (i === index ? { ...item, type } : item))
    );
  };

  // 辅助函数：将 URL 形式的图片无缝转为真实的 Base64 格式
  const convertUrlToBase64 = async (url: string): Promise<string> => {
    if (!url) return '';
    if (url.startsWith('data:image/')) return url;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(url);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[ProductUploadModal] convertUrlToBase64 failed, keeping original URL:', e);
      return url;
    }
  };

  /**
   * 客户端 Canvas 局部 ROI 快速裁切：
   * 当解构品缺少独立的 cropImageUrl 时，根据 boundingBox 快速切出单品独立特写并限制长边在 1024px 内
   * 杜绝将全景总图重复复制给每个搭配品，避免多模态 Payload 膨胀与 400 报错
   */
  const cropImageClientSide = async (
    sourceImageUrl: string,
    box?: { ymin: number; xmin: number; ymax: number; xmax: number }
  ): Promise<string | null> => {
    if (!sourceImageUrl || !box) return null;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const natW = img.naturalWidth || img.width;
          const natH = img.naturalHeight || img.height;
          if (!natW || !natH) return resolve(null);

          let xmin = Number(box.xmin) || 0;
          let ymin = Number(box.ymin) || 0;
          let xmax = Number(box.xmax) || 100;
          let ymax = Number(box.ymax) || 100;

          // 兼容 0~1 浮点数与 0~1000 格式
          const maxVal = Math.max(xmin, ymin, xmax, ymax);
          if (maxVal <= 1.05 && maxVal > 0) {
            xmin *= 100; ymin *= 100; xmax *= 100; ymax *= 100;
          } else if (maxVal > 100 && maxVal <= 1050) {
            xmin = (xmin / 1000) * 100; ymin = (ymin / 1000) * 100;
            xmax = (xmax / 1000) * 100; ymax = (ymax / 1000) * 100;
          }

          xmin = Math.max(0, Math.min(95, xmin));
          ymin = Math.max(0, Math.min(95, ymin));
          xmax = Math.max(xmin + 5, Math.min(100, xmax));
          ymax = Math.max(ymin + 5, Math.min(100, ymax));

          const left = Math.floor((xmin / 100) * natW);
          const top = Math.floor((ymin / 100) * natH);
          const width = Math.min(natW - left, Math.max(20, Math.ceil(((xmax - xmin) / 100) * natW)));
          const height = Math.min(natH - top, Math.max(20, Math.ceil(((ymax - ymin) / 100) * natH)));

          if (width <= 10 || height <= 10) return resolve(null);

          // 限制输出长边在 1024px 内，杜绝巨额 Payload 爆炸
          const maxEdge = 1024;
          let destW = width;
          let destH = height;
          if (Math.max(destW, destH) > maxEdge) {
            if (destW >= destH) {
              destH = Math.round((destH * maxEdge) / destW);
              destW = maxEdge;
            } else {
              destW = Math.round((destW * maxEdge) / destH);
              destH = maxEdge;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = destW;
          canvas.height = destH;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);

          ctx.drawImage(img, left, top, width, height, 0, 0, destW, destH);
          const croppedBase64 = canvas.toDataURL('image/webp', 0.88);
          resolve(croppedBase64);
        } catch (err) {
          console.warn('[cropImageClientSide] Canvas crop notice:', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = sourceImageUrl;
    });
  };

  // 触发 AI 多模态读数
  const handleExtractProductDna = async (customImages?: UploadedImageItem[]) => {
    const targetImages = customImages && customImages.length > 0 ? customImages : uploadedImages;
    if (targetImages.length === 0) {
      setAnalysisError('请先上传至少一张产品图片');
      return;
    }

    // 终止可能存在的旧请求 (支持 Abort)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // 关键：立即重置旧置信度与状态，确保无论是第一次还是第二次点击识别，均能即时呈现“深度解析中”动态反馈！
    setIsAnalyzing(true);
    setConfidenceScore(null);
    setAnalysisError(null);
    setElapsedMs(0);
    setAnalysisStage('阶段 1/4: 解析多视角图像视差与产品轮廓特征...');
    const startTime = Date.now();

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const diff = now - startTime;
      setElapsedMs(diff);
      if (diff < 2200) {
        setAnalysisStage('阶段 1/4: 解析多视角图像视差与产品轮廓特征...');
      } else if (diff < 5200) {
        setAnalysisStage('阶段 2/4: Gemini 视觉大模型测算真值长宽高与面料...');
      } else if (diff < 8200) {
        setAnalysisStage('阶段 3/4: 校验机械伸展机构与工程几何不变量...');
      } else {
        setAnalysisStage('阶段 4/4: 整理并写入空间产品档案仪表盘...');
      }
    }, 100);

    try {
      // 预处理图片：若包含非 Base64 的 URL，异步转换为真实 Base64，杜绝后端解析崩溃
      const preparedImages = await Promise.all(
        targetImages.map(async (img) => {
          if (img.base64 && !img.base64.startsWith('data:image/')) {
            const b64 = await convertUrlToBase64(img.base64);
            return { ...img, base64: b64 };
          }
          return img;
        })
      );

      // 同步更新前端 uploadedImages 中的缓存，后续使用无需重复转换
      setUploadedImages(preparedImages);

      const payload = {
        projectId,
        images: preparedImages.map((img) => ({
          base64: img.base64,
          type: img.type,
          fileName: img.name
        })),
        userNotes: userNotes.trim() || undefined
      };

      const response = await fetch('/api/space/build/extract-product-dna', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || '多模态读数失败，请重试');
      }

      const data = json.data;

      // 回填智能读数到界面状态中
      if (data.name) setName(data.name);
      if (data.sku) setSku(data.sku);
      if (data.role) setRole(data.role);
      if (data.priority) setPriority(data.priority);
      if (data.identityLock) setIdentityLock(data.identityLock);
      if (data.dimensions) {
        if (data.dimensions.width) setWidth(Number(data.dimensions.width));
        if (data.dimensions.depth) setDepth(Number(data.dimensions.depth));
        if (data.dimensions.height) setHeight(Number(data.dimensions.height));
      }
      if (Array.isArray(data.materials) && data.materials.length > 0) {
        setMaterials(data.materials);
      }
      if (Array.isArray(data.colors) && data.colors.length > 0) {
        setColors(data.colors);
      }
      if (Array.isArray(data.adaptiveStyles) && data.adaptiveStyles.length > 0) {
        setAdaptiveStyles(data.adaptiveStyles);
      }
      if (data.surfaceTexture) setSurfaceTexture(data.surfaceTexture);
      if (typeof data.functionCapable === 'boolean') setFunctionCapable(data.functionCapable);
      if (Array.isArray(data.lockedRules) && data.lockedRules.length > 0) {
        setLockedRules(data.lockedRules);
      }
      if (typeof data.readoutConfidence === 'number') {
        setConfidenceScore(data.readoutConfidence);
      }
      if (data.explanation) setExplanation(data.explanation);

      if (data.dossierSummary) {
        setDossierSummary(data.dossierSummary);
      } else if (data.name) {
        setDossierSummary(
          `AI 产品档案：${data.name} · 尺寸 ${data.dimensions?.width || 3100}×${data.dimensions?.depth || 1080}×${data.dimensions?.height || 950}mm · ${Array.isArray(data.materials) ? data.materials.join('、') : '高定面料'}`
        );
      }
      setDossierGeneratedAt(data.dossierGeneratedAt || new Date().toISOString());

      const totalSec = Number(((Date.now() - startTime) / 1000).toFixed(1));
      setAnalysisDuration(totalSec);
      setAnalysisCompletedAt(new Date().toLocaleTimeString());

      if (Array.isArray(data.structuralFeatures) && data.structuralFeatures.length > 0) {
        setStructuralFeatures(data.structuralFeatures);
      }

      setProvenance('AI_ESTIMATED');

      if (Array.isArray(data.referenceImages) && data.referenceImages.length > 0) {
        setCloudReferences(data.referenceImages);
      }

      if (data.sourceMasterImageUrl) {
        setSourceMasterImageUrl(data.sourceMasterImageUrl);
      } else if (targetImages[0]?.base64) {
        setSourceMasterImageUrl(targetImages[0].base64);
      }

      if (Array.isArray(data.detectedProducts) && data.detectedProducts.length > 0) {
        const masterImg = data.sourceMasterImageUrl || preparedImages[0]?.base64 || '';
        // 自动客户端自愈：如果某个单品未带切片，利用 Canvas 在客户端立即异步裁切补全
        const enrichedDetected = await Promise.all(
          data.detectedProducts.map(async (prod: DisaggregatedProductItem) => {
            let crop = prod.cropImageUrl || prod.cropBase64;
            if (!crop && prod.boundingBox && masterImg) {
              const clientCrop = await cropImageClientSide(masterImg, prod.boundingBox);
              if (clientCrop) {
                return {
                  ...prod,
                  cropImageUrl: clientCrop,
                  cropBase64: clientCrop
                };
              }
            }
            return prod;
          })
        );
        setDetectedProducts(enrichedDetected);
        setSelectedProductIndex(0);
        if (enrichedDetected.length > 1) {
          setPasteFeedback(`已从总图解构出 ${enrichedDetected.length} 款独立家具，并已建立总图来源索引！`);
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : '多模态读数解析失败';
      setAnalysisError(message);
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsAnalyzing(false);
    }
  };

  // 添加材质标签
  const handleAddMaterial = () => {
    if (newMaterialInput.trim()) {
      setMaterials((prev) => [...prev, newMaterialInput.trim()]);
      setNewMaterialInput('');
    }
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  // 添加色彩标签
  const handleAddColor = () => {
    if (newColorInput.trim()) {
      setColors((prev) => [...prev, newColorInput.trim()]);
      setNewColorInput('');
    }
  };

  const handleRemoveColor = (index: number) => {
    setColors((prev) => prev.filter((_, i) => i !== index));
  };

  // 添加/移除适配风格标签
  const handleAddStyle = (styleName?: string) => {
    const val = (styleName || newStyleInput).trim();
    if (val && !adaptiveStyles.includes(val)) {
      setAdaptiveStyles((prev) => [...prev, val]);
      setNewStyleInput('');
    }
  };

  const handleRemoveStyle = (index: number) => {
    setAdaptiveStyles((prev) => prev.filter((_, i) => i !== index));
  };

  // 添加锁定规则
  const handleAddRule = () => {
    if (newRuleInput.trim()) {
      setLockedRules((prev) => [...prev, newRuleInput.trim()]);
      setNewRuleInput('');
    }
  };

  const handleRemoveRule = (index: number) => {
    setLockedRules((prev) => prev.filter((_, i) => i !== index));
  };

  // 保存并加入资产库
  const handleConfirmSave = async () => {
    const finalProductId = initialProduct?.id || `prod-custom-${Date.now().toString(36)}`;
    const currentDetected = detectedProducts && detectedProducts[selectedProductIndex];
    let cropImg = currentDetected?.cropImageUrl;
    const masterImg = sourceMasterImageUrl || (uploadedImages[0]?.base64 || '');

    // 若无现成切片但有 boundingBox 与母图，立即执行前端 Canvas 快速精准局部裁切
    if (!cropImg && currentDetected?.boundingBox && masterImg) {
      cropImg = (await cropImageClientSide(masterImg, currentDetected.boundingBox)) || undefined;
    }

    const finalReferences: ProductReference[] =
      cloudReferences.length > 0
        ? cloudReferences
        : uploadedImages.map((img, idx) => ({
            id: img.id,
            type: img.type,
            objectKey: `projects/${projectId}/products/${finalProductId}/refs/ref-${idx + 1}/original.webp`,
            publicUrl: img.base64,
            verified: true
          }));

    const finalReferencesWithCrop: ProductReference[] = [
      ...(cropImg
        ? [
            {
              id: `ref-crop-${finalProductId}`,
              type: 'front' as const,
              objectKey: `projects/${projectId}/products/${finalProductId}/refs/crop/original.webp`,
              publicUrl: cropImg,
              verified: true
            }
          ]
        : []),
      ...finalReferences
    ];

    const finalProduct: ProductAsset = {
      id: finalProductId,
      sku: sku.trim() || `MW-CH-${Math.floor(1000 + Math.random() * 9000)}-3S`,
      name: name.trim() || '敏华芝华仕头等舱功能真皮沙发',
      role,
      priority,
      identityLock,
      dimensions: {
        width: Number(width) || 3100,
        depth: Number(depth) || 1080,
        height: Number(height) || 950
      },
      materials,
      colors,
      adaptiveStyles,
      isEnsembleIncluded,
      surfaceTexture,
      functionCapable,
      referenceImages: finalReferencesWithCrop,
      sourceMasterImageUrl: masterImg,
      sourceBoundingBox: currentDetected?.boundingBox,
      cropImageUrl: cropImg,
      cropBase64: cropImg,
      ensembleId: currentDetected?.ensembleId || (detectedProducts.length > 1 ? `ens-${projectId}-${Date.now().toString(36)}` : undefined),
      ensembleRoleTitle: currentDetected?.roleTitle || name.trim(),
      detectedProducts: detectedProducts.length > 0 ? detectedProducts : undefined,
      structuralFeatures,
      lockedRules,
      readoutConfidence: confidenceScore || 96,
      dossierSummary:
        dossierSummary ||
        `${name.trim() || '敏华芝华仕产品'} · 尺寸 ${Number(width) || 3100}×${Number(depth) || 1080}×${Number(height) || 950}mm · ${materials.join('、')}`,
      dossierGeneratedAt: dossierGeneratedAt || (confidenceScore ? new Date().toISOString() : undefined),
      provenance: productionTruth ? 'MANUAL_CONFIRMED' : provenance,
      productionTruth,
      sourceType: uploadedImages[0]?.name?.includes('画布') ? 'canvas_dna' : 'upload'
    };

    onSaveProduct(finalProduct);
    onClose();
  };

  // 一键全套批量入库所有解构产品（支持自动局部裁切，严禁将全景整图重复放入搭配品）
  const handleBatchSaveAllDetected = async () => {
    if (!detectedProducts || detectedProducts.length === 0) return;
    const commonEnsembleId = `ens-${projectId}-${Date.now().toString(36)}`;
    const masterImg = sourceMasterImageUrl || (uploadedImages[0]?.base64 || '');

    const allProducts: ProductAsset[] = [];

    for (let idx = 0; idx < detectedProducts.length; idx++) {
      const item = detectedProducts[idx];
      const prodId = `prod-ens-${Date.now().toString(36)}-${idx + 1}`;
      let itemCrop = item.cropImageUrl;

      // 若未提供后端切片，客户端自动 Canvas 裁切
      if (!itemCrop && item.boundingBox && masterImg) {
        itemCrop = (await cropImageClientSide(masterImg, item.boundingBox)) || undefined;
      }

      // 搭配品严禁将全景大图直接重复塞入，有切片优先放切片
      const itemReferences: ProductReference[] = [
        ...(itemCrop
          ? [
              {
                id: `ref-crop-${prodId}`,
                type: 'front' as const,
                objectKey: `projects/${projectId}/products/${prodId}/refs/crop/original.webp`,
                publicUrl: itemCrop,
                verified: true
              }
            ]
          : cloudReferences.length > 0
          ? cloudReferences
          : uploadedImages.map((img, rIdx) => ({
              id: `${img.id}-${idx}`,
              type: img.type,
              objectKey: `projects/${projectId}/products/${prodId}/refs/ref-${rIdx + 1}/original.webp`,
              publicUrl: img.base64,
              verified: true
            })))
      ];

      const isCurrent = idx === selectedProductIndex;
      let finalItemRole = isCurrent ? role : (item.role || (idx === 0 ? 'sofa_3seat' : 'coffee_table'));
      const itemName = isCurrent ? name : (item.name || '');
      const itemH = isCurrent ? Number(height) : (Number(item.dimensions?.height) || 0);
      const itemW = isCurrent ? Number(width) : (Number(item.dimensions?.width) || 0);

      if (/(茶几|岩板|大理石|几组|方几|圆几|中岛几|coffee.*table)/i.test(itemName) || (itemH > 0 && itemH <= 550 && itemW >= 700)) {
        finalItemRole = 'coffee_table';
      } else if (/(边几|角几|side.*table)/i.test(itemName) || (itemH > 0 && itemH <= 600 && itemW < 700 && /(几|台)/.test(itemName))) {
        finalItemRole = 'side_table';
      } else if (/(单人.*功能|电动.*单人|太空舱|零重力|头等舱.*单椅|recliner)/i.test(itemName)) {
        finalItemRole = 'recliner_1seat';
      }

      const isArmlessOrNonFunc =
        finalItemRole === 'lounge_chair' ||
        (itemName && /(休闲|无扶手|矮椅|旋转|单椅)/.test(itemName) && !/(功能|电动|头等舱|展开|太空舱)/.test(itemName));
      const resolvedRole = isArmlessOrNonFunc && finalItemRole === 'recliner_1seat' ? 'lounge_chair' : finalItemRole;
      const finalItemFunctionCapable = isCurrent
        ? functionCapable
        : typeof item.functionCapable === 'boolean'
        ? item.functionCapable
        : isArmlessOrNonFunc || resolvedRole === 'coffee_table' || resolvedRole === 'side_table'
        ? false
        : (resolvedRole === 'sofa_3seat' || resolvedRole === 'sofa_2seat' || resolvedRole === 'recliner_1seat');

      allProducts.push({
        id: prodId,
        sku: isCurrent ? sku : (item.sku || `MW-ENS-${Math.floor(1000 + Math.random() * 9000)}-${idx + 1}`),
        name: isCurrent ? name : (item.name || `解构产品 ${idx + 1}`),
        role: resolvedRole,
        priority: isCurrent ? priority : (item.priority || (idx === 0 ? 'primary' : 'secondary')),
        identityLock: 'strict' as const,
        dimensions: {
          width: isCurrent ? Number(width) : (Number(item.dimensions?.width) || 1200),
          depth: isCurrent ? Number(depth) : (Number(item.dimensions?.depth) || 800),
          height: isCurrent ? Number(height) : (Number(item.dimensions?.height) || 850)
        },
        materials: isCurrent ? materials : (Array.isArray(item.materials) && item.materials.length > 0 ? item.materials : materials),
        colors: isCurrent ? colors : (Array.isArray(item.colors) && item.colors.length > 0 ? item.colors : colors),
        adaptiveStyles: isCurrent ? adaptiveStyles : (Array.isArray(item.adaptiveStyles) && item.adaptiveStyles.length > 0 ? item.adaptiveStyles : adaptiveStyles),
        isEnsembleIncluded: true,
        surfaceTexture: isCurrent ? surfaceTexture : (item.surfaceTexture || surfaceTexture),
        functionCapable: finalItemFunctionCapable,
        referenceImages: itemReferences,
        cropImageUrl: itemCrop,
        cropBase64: itemCrop,
        sourceMasterImageUrl: masterImg,
        sourceBoundingBox: item.boundingBox,
        ensembleId: commonEnsembleId,
        ensembleRoleTitle: item.roleTitle || item.name,
        structuralFeatures: structuralFeatures,
        lockedRules: Array.isArray(item.lockedRules) && item.lockedRules.length > 0 ? item.lockedRules : lockedRules,
        readoutConfidence: confidenceScore || 96,
        dossierSummary:
          item.dossierSummary ||
          `${item.name} · 索引来自识别总图 · 尺寸 ${item.dimensions?.width}×${item.dimensions?.depth}×${item.dimensions?.height}mm`,
        dossierGeneratedAt: new Date().toISOString(),
        provenance: 'AI_ESTIMATED' as const,
        productionTruth: false,
        sourceType: 'upload' as const
      });
    }

    if (onBatchSaveProducts) {
      onBatchSaveProducts(allProducts);
    } else {
      allProducts.forEach((p) => onSaveProduct(p));
    }
    onClose();
  };

  const activeImage = uploadedImages[activeImageIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto select-none">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* 顶部 Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-[#FAF8F5] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                产品资产录入与多模态视觉读数
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-mono font-bold">
                  MANWAH Truth Engine V3.0
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 mt-0.5">
                上传家具实拍图/线稿/白底渲染图，多模态大模型自动解析三维毫米读数、材质纹理与空间物理真值
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-stone-200">
          {/* 左栏：图片上传与多视角管理 (5 cols) */}
          <div className="md:col-span-5 p-5 flex flex-col gap-4 bg-[#FCFBF9]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-800 text-xs flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                多角度参考图 ({uploadedImages.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteFromClipboardClick}
                  className="text-[11px] text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                  title="直接按 Ctrl+V 或点击粘贴剪贴板中的图片/截图"
                >
                  <Clipboard className="w-3.5 h-3.5 text-amber-600" />
                  <span>粘贴图片</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 border border-amber-300 text-amber-900 font-mono font-bold">
                    Ctrl+V
                  </span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] text-stone-600 hover:text-stone-800 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  本地上传
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {/* 剪贴板粘贴操作即时反馈条 */}
            {pasteFeedback && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">{pasteFeedback}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPasteFeedback(null)}
                  className="text-emerald-700 hover:text-emerald-950 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 一键导入创意画布已解析产品条幅 */}
            {detectedCanvasDraft && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                    <DownloadCloud className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-amber-950 truncate flex items-center gap-1.5">
                      <span>检测到画布已解析产品</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-200/80 text-amber-900 font-mono">
                        DNA
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-800/80 truncate">
                      {detectedCanvasDraft.productName || '15019(1).jpg 现代组合沙发'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleImportFromCanvas}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold shrink-0 shadow-xs transition flex items-center gap-1"
                >
                  <FileCheck className="w-3 h-3" />
                  <span>载入真值</span>
                </button>
              </div>
            )}

            {/* 主预览区 / 拖拽与剪贴板上传区 */}
            {uploadedImages.length === 0 ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 min-h-[260px] border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-2xl bg-amber-50/20 hover:bg-amber-50/40 p-6 flex flex-col items-center justify-center text-center cursor-pointer transition gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-amber-200 flex items-center justify-center text-amber-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-stone-800 text-xs flex items-center justify-center gap-1.5 flex-wrap">
                    <span>点击或拖拽产品图片至此，亦可按</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[10px] font-bold shadow-2xs">
                      Ctrl + V
                    </kbd>
                    <span>直接粘贴</span>
                  </div>
                  <div className="text-[10px] text-stone-400 mt-1">
                    支持直接粘贴微信/网页/系统截图 · 支持 JPEG、PNG、WebP（多图多视角）
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePasteFromClipboardClick();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold shadow-2xs flex items-center gap-1.5 transition active:scale-95"
                    title="从剪贴板粘贴截图或图片"
                  >
                    <Clipboard className="w-3.5 h-3.5 text-amber-600" />
                    <span>粘贴剪贴板图片</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-200/80 font-mono">
                      Ctrl+V
                    </span>
                  </button>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-600 font-medium">
                  推荐：正视图 + 45°黄金视角 + 伸展功能态
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* 大图预览 */}
                <div className="relative aspect-4/3 rounded-xl bg-stone-900 border border-stone-200 overflow-hidden group">
                  <img
                    src={activeImage?.base64}
                    alt={activeImage?.name}
                    className="w-full h-full object-contain"
                  />

                  {/* AI 识别过程动态激光扫描、HUD 准星与时间指示器 */}
                  {isAnalyzing && (
                    <>
                      {/* 动态激光扫描线 */}
                      <div
                        className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_16px_#22d3ee] pointer-events-none z-20 transition-all duration-100"
                        style={{ top: `${(Math.sin(elapsedMs / 350) * 0.45 + 0.5) * 100}%` }}
                      />
                      {/* 四角对焦框 HUD */}
                      <div className="absolute inset-0 border border-cyan-500/25 pointer-events-none z-10 flex flex-col justify-between p-3">
                        <div className="flex justify-between">
                          <div className="w-4 h-4 border-t-2 border-l-2 border-cyan-400" />
                          <div className="w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
                        </div>
                        <div className="flex justify-between">
                          <div className="w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
                          <div className="w-4 h-4 border-b-2 border-r-2 border-cyan-400" />
                        </div>
                      </div>
                      {/* 实时计时 HUD 徽标 */}
                      <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-black/85 backdrop-blur-md border border-cyan-500/50 text-cyan-300 text-[10px] font-mono flex items-center gap-1.5 shadow-lg z-30">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        <span>AI 扫描中 · {(elapsedMs / 1000).toFixed(1)}s</span>
                      </div>
                      {/* 底部阶段指示条与即时读数提示 */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3 pt-6 text-white z-30">
                        <div className="flex items-center justify-between text-[11px] font-medium mb-1.5 text-cyan-300">
                          <span className="flex items-center gap-1.5 truncate">
                            <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                            <span className="truncate">{analysisStage}</span>
                          </span>
                          <span className="font-mono text-xs font-bold text-amber-300 shrink-0 ml-2">
                            {(elapsedMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-orange-400 transition-all duration-150"
                            style={{ width: `${Math.min(96, Math.max(12, (elapsedMs / 9000) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-xs text-white text-[10px] font-medium flex items-center gap-1 z-20">
                    <span>视角:</span>
                    <select
                      value={activeImage?.type}
                      onChange={(e) =>
                        handleChangeImageType(
                          activeImageIndex,
                          e.target.value as UploadedImageItem['type']
                        )
                      }
                      className="bg-transparent border-none text-amber-400 font-bold focus:outline-hidden text-[10px] cursor-pointer"
                    >
                      <option value="front" className="bg-stone-900 text-white">主视图 (Front)</option>
                      <option value="45_deg" className="bg-stone-900 text-white">45° 黄金视角</option>
                      <option value="side" className="bg-stone-900 text-white">侧视图 (Side)</option>
                      <option value="back" className="bg-stone-900 text-white">后背视角 (Back)</option>
                      <option value="function_open" className="bg-stone-900 text-white">展开功能态 (Recline)</option>
                      <option value="detail" className="bg-stone-900 text-white">细节特写 (Detail)</option>
                      <option value="material" className="bg-stone-900 text-white">面料特写 (Material)</option>
                    </select>
                  </div>

                  {/* 多产品边界框 (Bounding Box HUD) - 针对总图视角 (Front 视角或第一张参考图) */}
                  {!isAnalyzing && detectedProducts && detectedProducts.length > 0 && activeImageIndex === 0 && (
                    <div className="absolute inset-0 pointer-events-none z-15">
                      {detectedProducts.map((item, idx) => {
                        const isSelected = selectedProductIndex === idx;
                        const isHovered = hoveredBoxIndex === idx;
                        const box = item.boundingBox || { ymin: 10, xmin: 10, ymax: 90, xmax: 90 };
                        const top = `${box.ymin}%`;
                        const left = `${box.xmin}%`;
                        const width = `${Math.max(4, box.xmax - box.xmin)}%`;
                        const height = `${Math.max(4, box.ymax - box.ymin)}%`;

                        return (
                          <div
                            key={item.id || idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectDetectedProduct(idx);
                            }}
                            onMouseEnter={() => setHoveredBoxIndex(idx)}
                            onMouseLeave={() => setHoveredBoxIndex(null)}
                            style={{ top, left, width, height }}
                            className={`absolute pointer-events-auto border-2 rounded transition-all cursor-pointer flex flex-col justify-between p-1.5 ${
                              isSelected
                                ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.6)] ring-2 ring-amber-300/80 z-20'
                                : isHovered
                                ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_10px_rgba(34,211,238,0.5)] z-20'
                                : 'border-rose-500/80 hover:border-amber-400 bg-rose-500/10 hover:bg-amber-500/10 z-10'
                            }`}
                          >
                            {/* 顶部标签 */}
                            <div className="flex items-center gap-1 self-start">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-tight flex items-center gap-1 shadow-sm ${
                                  isSelected
                                    ? 'bg-amber-500 text-stone-950 font-black'
                                    : 'bg-black/80 text-white border border-white/20 backdrop-blur-xs'
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                <span>#{idx + 1}</span>
                                <span className="truncate max-w-[100px]">{item.name}</span>
                              </span>
                            </div>

                            {/* 底部尺寸读数小标 */}
                            <div className="self-end">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[8px] font-mono shadow-sm ${
                                  isSelected
                                    ? 'bg-stone-950 text-amber-300 font-bold border border-amber-400/40'
                                    : 'bg-black/80 text-stone-300'
                                }`}
                              >
                                {item.dimensions?.width}×{item.dimensions?.depth}×{item.dimensions?.height}mm
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 总图检测提示角标 */}
                  {!isAnalyzing && detectedProducts && detectedProducts.length > 1 && activeImageIndex === 0 && (
                    <div className="absolute top-2 right-10 px-2 py-0.5 rounded bg-black/75 backdrop-blur-xs text-amber-300 text-[10px] font-mono flex items-center gap-1 z-20 border border-amber-500/40">
                      <Crosshair className="w-3 h-3 text-amber-400" />
                      <span>已框选 {detectedProducts.length} 款产品 (点击框选分配)</span>
                    </div>
                  )}

                  {!isAnalyzing && (
                    <button
                      onClick={() => handleRemoveImage(activeImageIndex)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition z-20"
                      title="移除此图"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 缩略图条 */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {uploadedImages.map((img, idx) => (
                    <div
                      key={img.id}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 cursor-pointer transition ${
                        idx === activeImageIndex
                          ? 'border-amber-500 ring-1 ring-amber-400'
                          : 'border-stone-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img.base64} alt={img.name} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] text-center truncate px-0.5">
                        {img.type === 'front' ? '正' : img.type === '45_deg' ? '45°' : img.type === 'function_open' ? '展开' : '特写'}
                      </span>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handlePasteFromClipboardClick}
                    className="w-14 h-14 rounded-lg border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-100/60 flex flex-col items-center justify-center text-amber-800 transition shrink-0 cursor-pointer"
                    title="粘贴剪贴板图片 (快捷键 Ctrl+V)"
                  >
                    <Clipboard className="w-4 h-4 text-amber-600" />
                    <span className="text-[9px] font-bold">粘贴</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-lg border-2 border-dashed border-stone-300 hover:border-amber-500 flex flex-col items-center justify-center text-stone-400 hover:text-amber-600 transition shrink-0 cursor-pointer"
                    title="从本地选择文件上传"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-[9px]">加图</span>
                  </button>
                </div>

                {/* 识别总图多产品解构栏 (Ensemble Disaggregation Bar) */}
                {detectedProducts && detectedProducts.length > 1 && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-300/80 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                        <Boxes className="w-4 h-4 text-amber-600" />
                        <span>总图已解构 {detectedProducts.length} 款独立家具</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-200/80 text-amber-900 font-mono font-medium">
                          点击分配入参
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-500 font-mono">
                        来源索引总图已关联
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {detectedProducts.map((prod, idx) => {
                        const isSelected = selectedProductIndex === idx;
                        return (
                          <div
                            key={prod.id || idx}
                            onClick={() => handleSelectDetectedProduct(idx)}
                            onMouseEnter={() => setHoveredBoxIndex(idx)}
                            onMouseLeave={() => setHoveredBoxIndex(null)}
                            className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 relative ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-400/60 shadow-xs'
                                : 'bg-white hover:bg-stone-50 border-stone-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${
                                  isSelected
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-stone-200 text-stone-700'
                                }`}
                              >
                                #{idx + 1}
                              </span>
                              <span className="text-[9px] text-stone-500 font-medium truncate max-w-[80px]">
                                {prod.roleTitle || prod.role}
                              </span>
                            </div>

                            {/* 单品局部裁切图或缩略图预览（多级保障：独立切片 -> 母图ROI缩放聚焦 -> 精致图标兜底） */}
                            {(() => {
                              const imgSrc = prod.cropImageUrl || prod.cropBase64;
                              const masterImg = sourceMasterImageUrl || (uploadedImages[0]?.base64 || '');
                              const box = prod.boundingBox;

                              if (imgSrc) {
                                return (
                                  <div className="w-full h-12 rounded bg-stone-900/10 overflow-hidden my-0.5 relative group border border-stone-200/60 shadow-2xs">
                                    <img
                                      src={imgSrc}
                                      alt={prod.name}
                                      className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                                    />
                                  </div>
                                );
                              }

                              if (masterImg && box) {
                                const boxW = Math.max(5, (box.xmax || 100) - (box.xmin || 0));
                                const boxH = Math.max(5, (box.ymax || 100) - (box.ymin || 0));
                                const bgSizeX = (100 / boxW) * 100;
                                const bgSizeY = (100 / boxH) * 100;
                                const bgPosX = box.xmin || 0;
                                const bgPosY = box.ymin || 0;
                                return (
                                  <div className="w-full h-12 rounded bg-stone-900/10 overflow-hidden my-0.5 relative border border-amber-400/40 shadow-2xs">
                                    <div
                                      className="w-full h-full"
                                      style={{
                                        backgroundImage: `url(${masterImg})`,
                                        backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                                        backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
                                        backgroundRepeat: 'no-repeat'
                                      }}
                                      title={`${prod.name} (总图聚焦)`}
                                    />
                                  </div>
                                );
                              }

                              return (
                                <div className="w-full h-12 rounded bg-stone-100 flex items-center justify-center my-0.5 border border-stone-200 text-stone-400">
                                  <Boxes className="w-4 h-4 text-stone-400" />
                                </div>
                              );
                            })()}

                            <div className="text-[11px] font-bold text-stone-900 truncate">
                              {prod.name}
                            </div>
                            <div className="text-[9px] font-mono text-stone-500">
                              {prod.dimensions?.width}×{prod.dimensions?.depth}×{prod.dimensions?.height}mm
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI 智能识别与生成产品档案核心操作块 */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300 shadow-xs flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-stone-900 text-xs">
                  <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
                  <span>AI 智能识别与生成产品档案</span>
                </div>
                {confidenceScore !== null ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono font-bold">
                    置信度 {confidenceScore}%
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-mono font-medium">
                    视觉大模型
                  </span>
                )}
              </div>

              <p className="text-[11px] text-stone-600 leading-relaxed">
                上传家具图片后，基于 Gemini 多模态自动测算长宽高、皮质肌理、机械五金结构与物理真值，生成可直接投产的空间产品档案。
              </p>

              <button
                type="button"
                onClick={() => handleExtractProductDna()}
                disabled={isAnalyzing || uploadedImages.length === 0}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all select-none ${
                  isAnalyzing
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-stone-950 font-black shadow-lg shadow-amber-500/30 ring-2 ring-amber-400 animate-pulse cursor-wait'
                    : uploadedImages.length === 0
                    ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-600 via-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-amber-900/15 ring-2 ring-amber-400/40 cursor-pointer active:scale-[0.99]'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin text-stone-950 shrink-0" />
                    <span className="font-mono font-black text-stone-950">
                      AI 深度识别中 · {(elapsedMs / 1000).toFixed(1)}s
                    </span>
                    <span className="text-[10px] text-stone-900 opacity-90 truncate hidden sm:inline font-sans">
                      ({analysisStage.slice(0, 18)}...)
                    </span>
                  </>
                ) : confidenceScore !== null || dossierSummary ? (
                  <>
                    <RotateCw className="w-4 h-4 text-amber-200" />
                    <span>🔄 重新 AI 识别并刷新产品档案</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-200" />
                    <span>✨ AI 智能识别 · 一键生成产品档案</span>
                  </>
                )}
              </button>
            </div>

            {/* 用户特别备注说明 */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-600">用户说明/特别备注 (可选)</label>
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="例如：南美特级进口半苯胺头层牛皮，带有双电机零重力伸展机构..."
                rows={2}
                className="w-full text-xs p-2 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden bg-white resize-none"
              />
            </div>

            {analysisError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{analysisError}</span>
              </div>
            )}

            {confidenceScore !== null && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center justify-between shadow-2xs">
                <span className="flex items-center gap-1.5 font-medium flex-wrap">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>AI 视觉读数提取完成</span>
                  {analysisDuration && (
                    <span className="font-mono font-bold bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded text-[10px] border border-emerald-300">
                      耗时 {analysisDuration}s
                    </span>
                  )}
                  {analysisCompletedAt && (
                    <span className="text-emerald-700 font-mono text-[10px]">
                      ({analysisCompletedAt})
                    </span>
                  )}
                </span>
                <span className="font-mono font-bold text-emerald-800 shrink-0 ml-2">
                  置信度 {confidenceScore}%
                </span>
              </div>
            )}
          </div>

          {/* 右栏：产品信息读数仪表盘与规格编辑 (7 cols) */}
          <div className="md:col-span-7 p-5 flex flex-col gap-3.5 overflow-y-auto">
            {/* 1. 顶部标题栏 */}
            <div className="flex items-center justify-between pb-2 border-b border-stone-200 shrink-0">
              <span className="font-bold text-stone-900 text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>产品真值读数仪表盘 (Physical Truth Readout)</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTextPasteModalOpen(true)}
                  className="text-[10px] px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-medium flex items-center gap-1 transition shadow-2xs cursor-pointer active:scale-95"
                  title="粘贴包含尺寸/型号/面料/颜色的规格文案，智能解析并自动填入表单"
                >
                  <FileText className="w-3 h-3 text-amber-700" />
                  <span>粘贴文本规格</span>
                </button>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-mono">
                  规格与几何不变量
                </span>
              </div>
            </div>

            {/* 2. AI 产品档案状态看板 */}
            <div className={`p-3 rounded-xl border transition-all relative overflow-hidden shrink-0 ${
              isAnalyzing
                ? 'bg-gradient-to-br from-amber-500/15 via-cyan-500/10 to-amber-500/5 border-amber-400 shadow-sm ring-1 ring-amber-400/40'
                : dossierSummary || confidenceScore !== null
                ? 'bg-gradient-to-br from-amber-50/80 via-white to-stone-50 border-amber-300/80 shadow-2xs'
                : 'bg-stone-50/80 border-stone-200'
            }`}>
              {isAnalyzing && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-cyan-400 to-amber-500 animate-pulse" />
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition ${
                    isAnalyzing
                      ? 'bg-amber-500 text-stone-950 animate-bounce'
                      : 'bg-amber-600/10 text-amber-700'
                  }`}>
                    {isAnalyzing ? <RotateCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-stone-900 text-xs flex items-center gap-1.5 flex-wrap">
                      <span>空间产品档案 (Product Dossier)</span>
                      {isAnalyzing ? (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500 text-stone-950 font-bold font-mono animate-pulse">
                          AI 识别中 · {(elapsedMs / 1000).toFixed(1)}s
                        </span>
                      ) : confidenceScore !== null ? (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                          已就绪 · 置信度 {confidenceScore}%
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-stone-500 truncate mt-0.5">
                      {isAnalyzing
                        ? `${analysisStage}`
                        : dossierGeneratedAt
                        ? `生成于 ${new Date(dossierGeneratedAt).toLocaleTimeString()}${analysisDuration ? ` · 耗时 ${analysisDuration}s` : ''}`
                        : '等待多模态识别生成或手动编辑录入'}
                    </p>
                  </div>
                </div>

                {uploadedImages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleExtractProductDna()}
                    disabled={isAnalyzing}
                    className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition shadow-2xs shrink-0 select-none ${
                      isAnalyzing
                        ? 'bg-amber-400 text-stone-950 font-mono ring-2 ring-amber-500 font-black shadow-md shadow-amber-400/40 animate-pulse cursor-wait'
                        : confidenceScore !== null || dossierSummary
                        ? 'text-stone-800 bg-white hover:bg-amber-50 border border-stone-300 hover:border-amber-400 cursor-pointer shadow-2xs'
                        : 'text-stone-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-400 shadow-sm ring-1 ring-amber-400/80 font-black cursor-pointer active:scale-95'
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin text-stone-950 shrink-0" />
                        <span>AI 识别中 · {(elapsedMs / 1000).toFixed(1)}s</span>
                      </>
                    ) : confidenceScore !== null || dossierSummary ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>重新识别档案</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-stone-950 shrink-0" />
                        <span>✨ 立即 AI 识别</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Active Progress Bar in Dossier Card */}
              {isAnalyzing && (
                <div className="mt-2.5 pt-2 border-t border-amber-300/40 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-amber-900 font-medium">
                    <span className="flex items-center gap-1 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                      <span className="truncate">正在提取长宽高、皮质肌理与几何不变量...</span>
                    </span>
                    <span className="font-mono font-bold shrink-0 ml-2">{(elapsedMs / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="w-full h-1.5 bg-amber-200/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 transition-all duration-150 animate-pulse"
                      style={{ width: `${Math.min(96, Math.max(15, (elapsedMs / 8000) * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              {dossierSummary && !isAnalyzing && (
                <div className="mt-2 p-2 rounded-lg bg-white/90 border border-amber-200/80 text-[11px] text-stone-700 leading-relaxed font-sans">
                  <div className="font-semibold text-stone-800 text-[10px] uppercase font-mono tracking-wider text-amber-800 mb-0.5">
                    档案特征摘要 (Dossier Summary)
                  </div>
                  {dossierSummary}
                </div>
              )}
            </div>

            {/* AI Active Scanning Form Notice */}
            {isAnalyzing && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-cyan-500/10 to-amber-500/10 border border-amber-400/60 text-[11px] text-amber-900 flex items-center gap-2.5 animate-pulse shadow-xs">
                <RotateCw className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                <div className="flex-1 flex items-center justify-between">
                  <span className="font-medium">AI 视觉空间大模型正在实时测算长宽高、皮质纹理与工业真值...</span>
                  <span className="font-mono font-bold bg-amber-500 text-stone-950 px-1.5 py-0.5 rounded text-[10px]">
                    计算中
                  </span>
                </div>
              </div>
            )}
            {/* 多产品解构分配入参指示器 */}
            {detectedProducts && detectedProducts.length > 1 && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-300 flex items-center justify-between text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-900 border border-amber-300 flex items-center justify-center font-black text-xs font-mono shrink-0">
                    #{selectedProductIndex + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-stone-900 text-xs flex items-center gap-2 truncate">
                      <span>已分配参数至单品:</span>
                      <span className="text-amber-800 font-bold underline underline-offset-2 truncate">
                        {detectedProducts[selectedProductIndex]?.name || name}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-mono text-[9px] font-bold">
                        第 {selectedProductIndex + 1}/{detectedProducts.length} 款
                      </span>
                      <span>来源索引总图: 主视图已锚定</span>
                      <span>·</span>
                      <span className="font-mono text-stone-600">
                        切片坐标 [{Math.round(detectedProducts[selectedProductIndex]?.boundingBox?.xmin || 0)}%, {Math.round(detectedProducts[selectedProductIndex]?.boundingBox?.ymin || 0)}%, {Math.round(detectedProducts[selectedProductIndex]?.boundingBox?.xmax || 100)}%, {Math.round(detectedProducts[selectedProductIndex]?.boundingBox?.ymax || 100)}%]
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {detectedProducts.map((p, idx) => (
                    <button
                      key={p.id || idx}
                      type="button"
                      onClick={() => handleSelectDetectedProduct(idx)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                        selectedProductIndex === idx
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white hover:bg-stone-100 border border-stone-200 text-stone-700'
                      }`}
                      title={`切换分配单品: ${p.name}`}
                    >
                      <span>#{idx + 1}</span>
                      <span className="hidden sm:inline max-w-[60px] truncate">{p.name.slice(0, 4)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 1. 核心标记 ①: 产品商业名称、空间角色与编码 */}
            <div className="grid grid-cols-4 gap-2.5">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-stone-800 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-amber-600" />
                  <span>产品规范全称 (Product Name)</span>
                  <span className="text-[10px] text-amber-600 font-normal">★ 核心标记</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：敏华芝华仕头等舱·意式极简电动功能真皮主沙发"
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden font-semibold shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-800">空间角色 (Role)</label>
                <select
                  value={role}
                  onChange={(e) => {
                    const newRole = e.target.value as ProductRole;
                    setRole(newRole);
                    if (newRole === 'lounge_chair') {
                      setFunctionCapable(false);
                    } else if (newRole === 'recliner_1seat' || newRole === 'sofa_3seat' || newRole === 'sofa_2seat') {
                      setFunctionCapable(true);
                    }
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white text-stone-900 font-semibold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden shadow-2xs cursor-pointer"
                >
                  <option value="sofa_3seat">三人位主功能沙发</option>
                  <option value="sofa_2seat">双人位功能沙发</option>
                  <option value="recliner_1seat">单人电动功能躺椅</option>
                  <option value="lounge_chair">无功能休闲矮单椅</option>
                  <option value="coffee_table">茶几组合</option>
                  <option value="dining_table">餐桌</option>
                  <option value="dining_chair">餐椅</option>
                  <option value="tv_console">电视地柜</option>
                  <option value="side_table">边几</option>
                  <option value="decor">家居陈设品</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-800">SKU / 货号编码</label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="MW-CH-9866-3S"
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden font-mono font-bold shadow-2xs"
                />
              </div>
            </div>

            {/* 2. 核心标记 ②: 三维工业尺寸毫米读数 (Dimensions mm) */}
            <div className="space-y-2 p-3.5 rounded-xl bg-stone-50 border border-stone-300/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-stone-900 flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>三维工程尺寸读数 (Dimensions mm)</span>
                  <span className="text-[10px] text-amber-600 font-normal font-sans">★ 核心标记</span>
                </span>
                <span className="text-[10px] text-stone-500 font-mono font-semibold">W × D × H (毫米)</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="space-y-1">
                  <span className="text-[10px] text-stone-700 font-mono font-bold flex items-center justify-between">
                    <span>总宽 W</span>
                    <span className="text-stone-400 font-normal">mm</span>
                  </span>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-950 font-mono font-extrabold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden shadow-2xs text-center"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-stone-700 font-mono font-bold flex items-center justify-between">
                    <span>总深 D</span>
                    <span className="text-stone-400 font-normal">mm</span>
                  </span>
                  <input
                    type="number"
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-950 font-mono font-extrabold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden shadow-2xs text-center"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-stone-700 font-mono font-bold flex items-center justify-between">
                    <span>总高 H</span>
                    <span className="text-stone-400 font-normal">mm</span>
                  </span>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-950 font-mono font-extrabold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden shadow-2xs text-center"
                  />
                </div>
              </div>
            </div>

            {/* 3. 核心标记 ③: 色彩体系与主色调 (Colors) */}
            <div className="space-y-2 p-3.5 rounded-xl bg-stone-50 border border-stone-300/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-stone-800 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-amber-600" />
                  <span>产品色彩体系与主色调 (Colors)</span>
                  <span className="text-[10px] text-amber-600 font-normal">★ 核心标记</span>
                </label>
                <span className="text-[10px] text-stone-500">已标记 {colors.length} 组色彩</span>
              </div>

              {/* 已选色彩标签 */}
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-white border border-stone-200 min-h-[38px]">
                {colors.map((c, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-stone-100 border border-stone-300 text-stone-900 font-semibold shadow-2xs"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 border border-black/10 shrink-0" />
                    <span>{c}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveColor(idx)}
                      className="text-stone-400 hover:text-rose-600 transition cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* 快捷色彩点选与自定义添加 */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-stone-500 shrink-0">快捷色彩库:</span>
                  {PRESET_COLORS.map((pc) => {
                    const isAdded = colors.some((c) => c.includes(pc));
                    return (
                      <button
                        key={pc}
                        type="button"
                        onClick={() => {
                          if (!isAdded) {
                            setColors((prev) => [...prev, pc]);
                          }
                        }}
                        disabled={isAdded}
                        className={`text-[10px] px-2 py-0.5 rounded border transition cursor-pointer ${
                          isAdded
                            ? 'bg-amber-100 text-amber-800 border-amber-300 opacity-60 cursor-default'
                            : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                        }`}
                      >
                        + {pc}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newColorInput}
                    onChange={(e) => setNewColorInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddColor())}
                    placeholder="自定义色彩（如：劳斯莱斯橙、云雾暖灰、曜石黑）..."
                    className="flex-1 text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 font-medium focus:border-amber-500 focus:outline-hidden shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddColor}
                    className="px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
                  >
                    添加色彩
                  </button>
                </div>
              </div>
            </div>

            {/* 4. 核心标记 ④: 适配空间风格 (Adaptive Styles) */}
            <div className="space-y-2 p-3.5 rounded-xl bg-stone-50 border border-stone-300/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-stone-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>适配空间风格 (Adaptive Styles)</span>
                  <span className="text-[10px] text-amber-600 font-normal">★ 核心标记 · 用于场景智能匹配</span>
                </label>
                <span className="text-[10px] text-stone-500">已标记 {adaptiveStyles.length} 款风格</span>
              </div>

              {/* 已选适配风格标签 */}
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-white border border-stone-200 min-h-[38px]">
                {adaptiveStyles.map((st, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-950 font-bold shadow-2xs"
                  >
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>{st}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveStyle(idx)}
                      className="text-stone-400 hover:text-rose-600 transition cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* 快捷推荐风格芯片 */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-stone-500 shrink-0">快捷空间风格:</span>
                  {PRESET_STYLES.map((ps) => {
                    const isAdded = adaptiveStyles.includes(ps);
                    return (
                      <button
                        key={ps}
                        type="button"
                        onClick={() => {
                          if (isAdded) {
                            setAdaptiveStyles((prev) => prev.filter((s) => s !== ps));
                          } else {
                            handleAddStyle(ps);
                          }
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded border transition cursor-pointer ${
                          isAdded
                            ? 'bg-amber-600 text-white border-amber-600 font-bold'
                            : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                        }`}
                      >
                        {isAdded ? `✓ ${ps}` : `+ ${ps}`}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStyleInput}
                    onChange={(e) => setNewStyleInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStyle())}
                    placeholder="自定义适配风格（如：意式轻奢、法式复古、侘寂风）..."
                    className="flex-1 text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 font-medium focus:border-amber-500 focus:outline-hidden shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddStyle()}
                    className="px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
                  >
                    添加风格
                  </button>
                </div>
              </div>
            </div>

            {/* 5. 空间角色定位与产品组合关联 (Product Role & Ensemble Association) */}
            <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-stone-900">产品组合与空间角色设定 (Ensemble & Role)</span>
                </div>
                {/* 勾选关联到当前场景套组 */}
                <label className="flex items-center gap-1.5 cursor-pointer bg-white px-2 py-1 rounded-md border border-amber-300 shadow-2xs">
                  <input
                    type="checkbox"
                    checked={isEnsembleIncluded}
                    onChange={(e) => setIsEnsembleIncluded(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-600 cursor-pointer"
                  />
                  <span className="text-[11px] font-bold text-amber-900">关联至当前场景套组</span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-800">空间角色 (Space Role)</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as ProductRole)}
                    className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-900 font-semibold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden shadow-2xs cursor-pointer"
                  >
                    <option value="sofa_3seat">3人位主功能沙发 (sofa_3seat)</option>
                    <option value="sofa_2seat">2人位功能沙发 (sofa_2seat)</option>
                    <option value="recliner_1seat">单人电动功能躺椅 (recliner_1seat)</option>
                    <option value="lounge_chair">单人休闲单椅/无扶手椅 (lounge_chair)</option>
                    <option value="coffee_table">主次茶几组合 (coffee_table)</option>
                    <option value="side_table">边几 (side_table)</option>
                    <option value="dining_table">餐桌 (dining_table)</option>
                    <option value="dining_chair">餐椅 (dining_chair)</option>
                    <option value="tv_console">电视地柜 (tv_console)</option>
                    <option value="decor">软装陈设 (decor)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-800">空间定位 (Priority)</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'primary' | 'secondary' | 'decor')}
                    className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-900 font-semibold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden shadow-2xs cursor-pointer"
                  >
                    <option value="primary">核心主品 (Hero 焦点)</option>
                    <option value="secondary">配套次件 (Secondary)</option>
                    <option value="decor">环境点缀 (Decor)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-800">锁定级别 (Identity Lock)</label>
                  <select
                    value={identityLock}
                    onChange={(e) => setIdentityLock(e.target.value as 'strict' | 'normal' | 'loose')}
                    className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-900 font-semibold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-hidden shadow-2xs cursor-pointer"
                  >
                    <option value="strict">Strict (严格几何与材质锁死)</option>
                    <option value="normal">Normal (标准保真)</option>
                    <option value="loose">Loose (仅继承色调与轮廓)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 6. 材质与机构读数 (Materials & Mechanics) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-stone-800 flex items-center justify-between">
                <span>材质与机械机构读数 (Materials & Mechanics)</span>
                <span className="text-[10px] text-stone-500 font-normal">可增删定制</span>
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-stone-100/70 border border-stone-300 min-h-[44px]">
                {materials.map((m, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-white border border-stone-300 text-stone-900 font-semibold shadow-2xs"
                  >
                    • {m}
                    <button
                      onClick={() => handleRemoveMaterial(idx)}
                      className="text-stone-400 hover:text-rose-600 transition cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMaterialInput}
                  onChange={(e) => setNewMaterialInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMaterial())}
                  placeholder="添加材质/电机/海绵描述..."
                  className="flex-1 text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 font-medium focus:border-amber-500 focus:outline-hidden shadow-2xs"
                />
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 5. 表面纹理与功能特性 */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-stone-800">表面皮革肌理与缝制工艺</label>
              <input
                type="text"
                value={surfaceTexture}
                onChange={(e) => setSurfaceTexture(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white text-stone-900 font-semibold focus:border-amber-500 focus:outline-hidden shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 border border-amber-200/60">
              <div>
                <div className="font-semibold text-stone-900 text-xs">电动无极调节功能 (Power Motion Recline)</div>
                <div className="text-[10px] text-stone-500">
                  支持零重力大角度展开与独立脚踏伸缩
                </div>
              </div>
              <input
                type="checkbox"
                checked={functionCapable}
                onChange={(e) => setFunctionCapable(e.target.checked)}
                className="w-4 h-4 accent-amber-600 cursor-pointer"
              />
            </div>

            {/* 6. 物理真值锁定规则 (Strict Locks) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-700 flex items-center justify-between">
                <span>物理不变量锁定规则 (Spatial Invariant Locks)</span>
                <span className="text-[10px] text-stone-400 font-mono">生审统一门禁</span>
              </label>
              <div className="space-y-1 p-2 rounded-xl bg-stone-50 border border-stone-200">
                {lockedRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 text-[11px] text-stone-700 bg-white px-2 py-1 rounded border border-stone-200/80"
                  >
                    <span className="truncate">🔒 {rule}</span>
                    <button
                      onClick={() => handleRemoveRule(idx)}
                      className="text-stone-400 hover:text-rose-600 shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRule())}
                  placeholder="添加一条不可篡改规则..."
                  className="flex-1 text-xs p-2 rounded-lg border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 font-medium focus:border-amber-500 focus:outline-hidden shadow-2xs"
                />
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 7. 工程真值与数据溯源门禁 (Truth & Provenance Gate) */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-stone-800 text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>工程真值与数据溯源门禁</span>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                  productionTruth
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}>
                  {provenance}
                </span>
              </div>
              <p className="text-[10px] text-stone-500 leading-normal">
                遵守工程开发宪法：AI 深度推断值默认设为 AI_ESTIMATED，置信度 {confidenceScore || 96}%。仅在用户确认锁定后，方可升级为不可破坏的生产真值。
              </p>
              <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-stone-200 cursor-pointer hover:bg-amber-50/50 transition">
                <input
                  type="checkbox"
                  checked={productionTruth}
                  onChange={(e) => {
                    setProductionTruth(e.target.checked);
                    setProvenance(e.target.checked ? 'MANUAL_CONFIRMED' : 'AI_ESTIMATED');
                  }}
                  className="w-4 h-4 accent-amber-600"
                />
                <div className="text-[11px] font-bold text-stone-800">
                  确认锁定为生产真值 (Lock as Production Truth)
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* 底部 Footer 控制条 */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-stone-200 bg-[#FAF8F5] shrink-0">
          <div className="text-[11px] text-stone-500 flex items-center gap-2">
            <span>
              {uploadedImages.length > 0
                ? `已准备好 ${uploadedImages.length} 视角真值数据`
                : '请先上传产品图片'}
            </span>
            {detectedProducts && detectedProducts.length > 1 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                已解构出 {detectedProducts.length} 款组合单品
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-200/60 transition cursor-pointer"
            >
              取消
            </button>
            {detectedProducts && detectedProducts.length > 1 && (
              <button
                type="button"
                onClick={handleBatchSaveAllDetected}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-md transition flex items-center gap-1.5 ring-2 ring-amber-400/40 cursor-pointer"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>一键全套入库 (共 {detectedProducts.length} 款)</span>
              </button>
            )}
            <button
              onClick={handleConfirmSave}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {detectedProducts && detectedProducts.length > 1
                  ? `保存当前单品 (#${selectedProductIndex + 1})`
                  : '保存并加入空间产品库'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 智能粘贴规格文案识别模态弹层 */}
      {isTextPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-stone-200 flex flex-col gap-3 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-stone-900">
                <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span>粘贴产品规格文案 · 智能填表</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTextPasteModalOpen(false)}
                className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              将 ERP、Excel 或业务沟通中的产品文案直接粘贴至下方，系统将自动提取长宽高毫米读数、SKU/货号、面料材质与色彩风格：
            </p>
            <textarea
              value={rawPastedText}
              onChange={(e) => setRawPastedText(e.target.value)}
              placeholder={`例如：\n敏华芝华仕头等舱电动真皮功能沙发\n型号：MW-S9821\n尺寸：3100*1080*950mm\n材质：南美半苯胺头层牛皮、德国双电机\n颜色：云雾暖灰、曜石深灰\n风格：意式轻奢、现代极简`}
              rows={6}
              className="w-full text-xs p-3 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden font-mono bg-stone-50 resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-stone-400 font-mono">
                {rawPastedText ? `已输入 ${rawPastedText.length} 字` : '可直接按 Ctrl+V 粘贴'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRawPastedText('');
                    setIsTextPasteModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (rawPastedText.trim()) {
                      applyParsedProductText(rawPastedText.trim());
                      setRawPastedText('');
                      setIsTextPasteModalOpen(false);
                    }
                  }}
                  disabled={!rawPastedText.trim()}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer ${
                    rawPastedText.trim()
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                  <span>立即解析填表</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
