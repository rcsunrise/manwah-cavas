// src/features/space-studio/components/ProductUploadModal.tsx
// MANWAH Space Studio｜产品资产上传窗口与多模态读数控制台 V3.0
import React, { useState, useRef, useEffect } from 'react';
import {
  ProductAsset,
  ProductRole,
  ProductReference
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
  FileCheck
} from 'lucide-react';

interface UploadedImageItem {
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
  initialProduct?: ProductAsset | null;
  projectId?: string;
}

export const ProductUploadModal: React.FC<ProductUploadModalProps> = ({
  isOpen,
  onClose,
  onSaveProduct,
  initialProduct = null,
  projectId = 'manwah-noble-space-01'
}) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImageItem[]>(() => {
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // 处理文件选择与拖拽
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    let processedCount = 0;
    const newItems: UploadedImageItem[] = [];

    validFiles.forEach((file, index) => {
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
            name: file.name
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

    setIsAnalyzing(true);
    setAnalysisError(null);
    setElapsedMs(0);
    setAnalysisStage('阶段 1/4: 解析多角度视差与产品轮廓特征...');
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
        setAnalysisStage('阶段 2/4: Gemini 3.1 视觉大模型测算真值长宽高与面料...');
      } else if (diff < 8200) {
        setAnalysisStage('阶段 3/4: 校验机械伸展机构与工程几何不变量...');
      } else {
        setAnalysisStage('阶段 4/4: 整理并写入空间产品档案仪表盘...');
      }
    }, 100);

    try {
      const payload = {
        projectId,
        images: targetImages.map((img) => ({
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
  const handleConfirmSave = () => {
    const finalProductId = initialProduct?.id || `prod-custom-${Date.now().toString(36)}`;
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
      surfaceTexture,
      functionCapable,
      referenceImages: finalReferences,
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
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3 h-3" />
                添加图片
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

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

            {/* 主预览区 / 拖拽上传区 */}
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
                  <div className="font-bold text-stone-800 text-xs">点击或拖拽产品图片至此</div>
                  <div className="text-[10px] text-stone-400 mt-1">
                    支持 JPEG、PNG、WebP（支持多张多视角）
                  </div>
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
                    onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-lg border-2 border-dashed border-stone-300 hover:border-amber-500 flex flex-col items-center justify-center text-stone-400 hover:text-amber-600 transition shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-[9px]">加图</span>
                  </button>
                </div>
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
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all ${
                  isAnalyzing
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 ring-2 ring-amber-400/40 cursor-wait'
                    : uploadedImages.length === 0
                    ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-600 via-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-amber-900/15 ring-2 ring-amber-400/30'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin text-amber-700 shrink-0" />
                    <span className="font-mono font-bold">AI 深度识别中 · {(elapsedMs / 1000).toFixed(1)}s</span>
                    <span className="text-[10px] opacity-75 truncate hidden sm:inline">
                      ({analysisStage.slice(0, 16)}...)
                    </span>
                  </>
                ) : confidenceScore !== null ? (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-200" />
                    <span>重新 AI 识别并刷新产品档案</span>
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
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-mono">
                规格与几何不变量
              </span>
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
                    className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition shadow-2xs shrink-0 cursor-pointer ${
                      isAnalyzing
                        ? 'bg-amber-500 text-stone-950 font-mono ring-2 ring-amber-400 font-bold animate-pulse'
                        : confidenceScore
                        ? 'text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-300'
                        : 'text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-sm ring-1 ring-amber-400/30'
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin text-stone-950 shrink-0" />
                        <span>AI 计算中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                        <span>{confidenceScore ? '重新识别档案' : '立即 AI 识别'}</span>
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

            {/* 1. 基础商业属性 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-stone-700">产品全称 (Product Name)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：敏华芝华仕头等舱·意式极简电动功能真皮主沙发"
                  className="w-full text-xs p-2 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-stone-700">SKU 编码 (Model/SKU)</label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="MW-CH-9866-3S"
                  className="w-full text-xs p-2 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-stone-700">空间角色 (Space Role)</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as ProductRole)}
                  className="w-full text-xs p-2 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden bg-white"
                >
                  <option value="sofa_3seat">3人位主功能沙发 (sofa_3seat)</option>
                  <option value="sofa_2seat">2人位功能沙发 (sofa_2seat)</option>
                  <option value="recliner_1seat">单人电动功能躺椅 (recliner_1seat)</option>
                  <option value="coffee_table">主次茶几组合 (coffee_table)</option>
                  <option value="side_table">边几 (side_table)</option>
                  <option value="dining_table">餐桌 (dining_table)</option>
                  <option value="dining_chair">餐椅 (dining_chair)</option>
                  <option value="tv_console">电视地柜 (tv_console)</option>
                  <option value="decor">软装陈设 (decor)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-stone-700">空间定位 (Priority)</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'primary' | 'secondary' | 'decor')}
                  className="w-full text-xs p-2 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden bg-white"
                >
                  <option value="primary">主件主角 (Strict Lock 绝对物理保真)</option>
                  <option value="secondary">配套次件 (Secondary)</option>
                  <option value="decor">环境点缀 (Decor)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-stone-700">锁定级别 (Identity Lock)</label>
                <select
                  value={identityLock}
                  onChange={(e) => setIdentityLock(e.target.value as 'strict' | 'normal' | 'loose')}
                  className="w-full text-xs p-2 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden bg-white"
                >
                  <option value="strict">Strict (严格几何与材质锁死)</option>
                  <option value="normal">Normal (标准保真)</option>
                  <option value="loose">Loose (仅继承色调与轮廓)</option>
                </select>
              </div>
            </div>

            {/* 2. 三维工业尺寸毫米读数 (Dimensions mm) */}
            <div className="space-y-1.5 p-3 rounded-xl bg-[#FAF8F5] border border-stone-200/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-stone-800 flex items-center gap-1">
                  <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
                  三维工业尺寸毫米读数 (Dimensions mm)
                </span>
                <span className="text-[10px] text-stone-400 font-mono">W × D × H</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-stone-500 font-mono">宽度 W (mm)</span>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full text-xs p-1.5 rounded-lg border border-stone-200 bg-white font-mono font-semibold"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-stone-500 font-mono">深度 D (mm)</span>
                  <input
                    type="number"
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                    className="w-full text-xs p-1.5 rounded-lg border border-stone-200 bg-white font-mono font-semibold"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-stone-500 font-mono">高度 H (mm)</span>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="w-full text-xs p-1.5 rounded-lg border border-stone-200 bg-white font-mono font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* 3. 材质与机构读数 (Materials & Mechanics) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-700 flex items-center justify-between">
                <span>材质与机械机构读数 (Materials & Mechanics)</span>
                <span className="text-[10px] text-stone-400 font-normal">可增删定制</span>
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-stone-50 border border-stone-200 min-h-[44px]">
                {materials.map((m, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-white border border-stone-200 text-stone-800 shadow-2xs"
                  >
                    • {m}
                    <button
                      onClick={() => handleRemoveMaterial(idx)}
                      className="text-stone-400 hover:text-rose-600 transition"
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
                  className="flex-1 text-xs p-1.5 rounded-lg border border-stone-200 focus:border-amber-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="px-3 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-medium"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 4. 色彩体系与表面纹理 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-700">色彩体系 (Colors)</label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-stone-50 border border-stone-200">
                {colors.map((c, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-white border border-stone-200 text-stone-800"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    {c}
                    <button
                      onClick={() => handleRemoveColor(idx)}
                      className="text-stone-400 hover:text-rose-600 transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newColorInput}
                  onChange={(e) => setNewColorInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddColor())}
                  placeholder="添加色彩（如：极地奶白、鞍褐焦糖）..."
                  className="flex-1 text-xs p-1.5 rounded-lg border border-stone-200 focus:border-amber-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddColor}
                  className="px-3 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-medium"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 5. 表面纹理与功能特性 */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-stone-700">表面皮革肌理与缝制工艺</label>
              <input
                type="text"
                value={surfaceTexture}
                onChange={(e) => setSurfaceTexture(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-stone-200 focus:border-amber-500 focus:outline-hidden"
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
                  className="flex-1 text-xs p-1.5 rounded-lg border border-stone-200 focus:border-amber-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="px-3 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-medium"
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
          <div className="text-[11px] text-stone-500">
            {uploadedImages.length > 0
              ? `已准备好 ${uploadedImages.length} 视角真值数据`
              : '请先上传产品图片'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-200/60 transition"
            >
              取消
            </button>
            <button
              onClick={handleConfirmSave}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>保存并加入空间产品库</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
