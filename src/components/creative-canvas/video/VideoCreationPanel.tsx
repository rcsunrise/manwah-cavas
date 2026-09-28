// src/components/creative-canvas/video/VideoCreationPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  Sparkles,
  Film,
  Video,
  Layers,
  Wand2,
  Clock,
  Play,
  RotateCw,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Plus,
  Image as ImageIcon,
  Check,
  Trash2,
  Sliders,
  Cpu,
  Tv
} from 'lucide-react';
import {
  VideoCreationMode,
  VideoStyle,
  VideoSettings,
  VideoDirectorPlan,
  VideoJob,
  VideoShotPlan
} from '../../../types/creativeCanvasVideo';
import { useCanvasVideo } from '../../../hooks/useCanvasVideo';
import { VideoGenerationService } from '../../../services/videoGenerationService';

interface VideoCreationPanelProps {
  canvasId: string;
  isOpen: boolean;
  onClose: () => void;
  selectedNode: {
    id: string;
    type: string;
    title: string;
    imageUrl?: string;
    assetVersionId?: string | null;
  } | null;
  allNodes?: any[];
  onPlanCreated?: (plan: VideoDirectorPlan, sourceNodeId: string) => void;
  onJobSubmitted?: (job: VideoJob, sourceNodeId: string) => void;
}

const PRESET_FOCUS_POINTS = [
  '皮面质感与细腻缝线',
  '人体工学靠包承托',
  '智能电动伸展/零重力仰躺',
  '稳固实木骨架与金属纤细高脚',
  '高回弹海绵与陷入感坐深',
  '极简现代空间整体光影搭配',
  '静音五金导轨平顺开合',
  '360度自由旋转底座'
];

const DIRECTOR_MODELS = [
  { key: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', desc: 'Google 旗舰多模态 · 精准视觉运镜', tag: '推荐首选' },
  { key: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', desc: 'Google 新一代超高速多模态', tag: '极速出片' },
  { key: 'gpt-6-astra', name: 'GPT-6 Astra', desc: 'OpenAI 旗舰强推理 · 影视级叙事', tag: '强推理' },
  { key: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', desc: 'OpenAI 旗舰基础模型 · 细节严密', tag: '稳定' },
  { key: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', desc: 'OpenAI 轻量高性价比模型', tag: '高性价比' }
];

export const VideoCreationPanel: React.FC<VideoCreationPanelProps> = ({
  canvasId,
  isOpen,
  onClose,
  selectedNode,
  allNodes,
  onPlanCreated,
  onJobSubmitted
}) => {
  const {
    capabilities,
    defaultModelKey,
    storageInfo,
    jobs,
    directorPlan,
    setDirectorPlan,
    isGeneratingPlan,
    isSubmittingJob,
    error,
    generatePlan,
    submitVideo,
    retryTransfer
  } = useCanvasVideo(canvasId);

  // Tab & Basic state
  const [activeTab, setActiveTab] = useState<VideoCreationMode>('product_showcase');
  const [style, setStyle] = useState<VideoStyle>('single_take');
  const [userPrompt, setUserPrompt] = useState('');
  const [productTitle, setProductTitle] = useState('');

  // Reference Images state (multi-image support & upload)
  const [referenceImages, setReferenceImages] = useState<
    Array<{ id: string; url: string; title: string; assetVersionId?: string }>
  >([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-select Focus Points state
  const [focusPointsList, setFocusPointsList] = useState<string[]>(PRESET_FOCUS_POINTS);
  const [selectedFocusPoints, setSelectedFocusPoints] = useState<string[]>([
    '皮面质感与细腻缝线',
    '极简现代空间整体光影搭配'
  ]);
  const [customFocusInput, setCustomFocusInput] = useState('');

  // Director LLM Model
  const [selectedDirectorModel, setSelectedDirectorModel] = useState<string>('gemini-3.7-flash');

  // Video Synthesis Model & Settings
  const [selectedModelKey, setSelectedModelKey] = useState<string>(defaultModelKey);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    durationSeconds: 5,
    resolution: '720p',
    ratio: '16:9',
    audioMode: 'none'
  });

  // Keyframe generation tracking state per shot
  const [generatingKeyframeShotId, setGeneratingKeyframeShotId] = useState<string | null>(null);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);

  // Sync selectedNode image to reference images if not already present
  useEffect(() => {
    if (selectedNode?.imageUrl) {
      let finalTitle = '现代意式真皮功能沙发';
      const nodeTitle = selectedNode.title || '';
      
      const isPlaceholderId = 
        nodeTitle.startsWith('node-') || 
        nodeTitle.startsWith('img-node-') || 
        nodeTitle.startsWith('asset-') || 
        nodeTitle.startsWith('ref-') ||
        nodeTitle.match(/^[a-z0-9-_]{8,}$/i);

      if (nodeTitle && !isPlaceholderId) {
        finalTitle = nodeTitle;
      }

      // 顺藤摸瓜：扫描 allNodes 寻找 Product DNA 节点提取核心描述
      if (allNodes && allNodes.length > 0) {
        const dnaNode = allNodes.find(n => n.type === 'productDnaNode' || n.id === 'dna-node-1');
        if (dnaNode?.data?.dna) {
          const dna = dnaNode.data.dna;
          const tone = dna.primaryColor || '';
          const category = dna.category || '沙发';
          const materials = Array.isArray(dna.materials) ? dna.materials.slice(0, 3).join(' ') : '';
          const style = Array.isArray(dna.style) ? dna.style[0] || '' : '';
          
          if (tone || category || materials) {
            finalTitle = `${tone} ${materials} ${style}${category}`.replace(/\s+/g, ' ').trim();
          }
        }
      }

      setProductTitle(finalTitle);
      setReferenceImages(prev => {
        const exists = prev.some(img => img.url === selectedNode.imageUrl);
        if (exists) return prev;
        return [
          {
            id: `node-${selectedNode.id}`,
            url: selectedNode.imageUrl!,
            title: finalTitle,
            assetVersionId: selectedNode.assetVersionId || undefined
          },
          ...prev
        ];
      });
    }
  }, [selectedNode, allNodes]);

  // Sync video model
  useEffect(() => {
    if (capabilities.length > 0) {
      if (!selectedModelKey || !capabilities.some(c => c.key === selectedModelKey)) {
        const nextKey = capabilities.some(c => c.key === defaultModelKey) ? defaultModelKey : capabilities[0].key;
        setSelectedModelKey(nextKey);
      }
    }
  }, [capabilities, defaultModelKey, selectedModelKey]);

  if (!isOpen) return null;

  const currentCapability = capabilities.find(c => c.key === selectedModelKey) || capabilities[0];

  // Handle uploading local reference image
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const res = await VideoGenerationService.uploadReferenceImage(file);
      const newImg = {
        id: `upload-${Date.now()}`,
        url: res.url,
        title: file.name,
        assetVersionId: res.assetVersionId
      };
      setReferenceImages(prev => [...prev, newImg]);
    } catch (err: any) {
      alert(`参考图上传失败: ${err.message || '未知错误'}`);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveReferenceImage = (id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id));
  };

  // Focus points toggle
  const handleToggleFocusPoint = (point: string) => {
    setSelectedFocusPoints(prev =>
      prev.includes(point) ? prev.filter(p => p !== point) : [...prev, point]
    );
  };

  const handleAddCustomFocusPoint = () => {
    const trimmed = customFocusInput.trim();
    if (!trimmed) return;
    if (!focusPointsList.includes(trimmed)) {
      setFocusPointsList(prev => [...prev, trimmed]);
    }
    if (!selectedFocusPoints.includes(trimmed)) {
      setSelectedFocusPoints(prev => [...prev, trimmed]);
    }
    setCustomFocusInput('');
  };

  // AI Prompt Expansion helper
  const handleExpandPrompt = () => {
    const focusStr = selectedFocusPoints.join('、');
    if (!userPrompt.trim()) {
      setUserPrompt(`镜头45度微仰缓缓推进，室内晨光洒在家具边缘，重点展示【${focusStr || '皮面纹理与空间光影'}】，画面平稳高级，4K电影质感`);
    } else {
      setUserPrompt(prev => `${prev}，运镜平稳缓慢推进，聚焦微距展示【${focusStr || '材质工艺'}】，柔和环境光流动，高保真4K超清`);
    }
  };

  // Generate Director Brief
  const handleGeneratePlan = async () => {
    if (!selectedNode && referenceImages.length === 0) return;
    const primaryImg = referenceImages[0] || (selectedNode?.imageUrl ? { id: `node-${selectedNode.id}`, url: selectedNode.imageUrl, title: selectedNode.title, assetVersionId: selectedNode.assetVersionId || undefined } : undefined);

    const plan = await generatePlan({
      mode: activeTab,
      style,
      userPrompt: userPrompt.trim() || '产品全景微移，展现高端居家光影质感',
      focusPoints: selectedFocusPoints,
      focusPoint: selectedFocusPoints.join('、'),
      sourceAssetVersionId: primaryImg?.assetVersionId || selectedNode?.assetVersionId,
      sourceImageUrl: primaryImg?.url,
      directorModelKey: selectedDirectorModel,
      referenceImages: referenceImages.map(img => ({ url: img.url, title: img.title })),
      productTitle: productTitle || selectedNode?.title || '现代意式真皮家具',
      productCategory: '高端家具与家居'
    });

    if (onPlanCreated && selectedNode) {
      onPlanCreated(plan, selectedNode.id);
    }
  };

  // Generate Static Keyframe image for single shot
  const handleGenerateKeyframe = async (shot: VideoShotPlan) => {
    setGeneratingKeyframeShotId(shot.shotId);
    try {
      const primaryUrl = referenceImages[0]?.url || selectedNode?.imageUrl;
      const res = await VideoGenerationService.generateShotKeyframe({
        canvasId,
        shotId: shot.shotId,
        prompt: shot.prompt,
        referenceImageUrl: primaryUrl,
        productTitle: productTitle || selectedNode?.title || '现代意式家具'
      });

      if (directorPlan) {
        const updatedShots = directorPlan.shots.map(s =>
          s.shotId === shot.shotId ? { ...s, keyframeImageUrl: res.keyframeUrl } : s
        );
        setDirectorPlan({ ...directorPlan, shots: updatedShots });
      }
    } catch (err: any) {
      alert(`生成镜头关键帧失败: ${err.message || '未知错误'}`);
    } finally {
      setGeneratingKeyframeShotId(null);
    }
  };

  // Submit single shot video generation
  const handleSubmitDirectVideo = async (shotPrompt?: string, shotId?: string, keyframeUrl?: string) => {
    if (!selectedNode && referenceImages.length === 0) return;
    const finalPrompt = shotPrompt || userPrompt || '现代意式真皮沙发，微距推进，光影质感流动';
    const effectiveImageUrl = keyframeUrl || referenceImages[0]?.url || selectedNode?.imageUrl;

    const job = await submitVideo({
      sourceNodeId: selectedNode?.id || `ref-${Date.now()}`,
      sourceAssetVersionId: selectedNode?.assetVersionId,
      sourceImageUrl: effectiveImageUrl,
      mode: activeTab,
      style,
      modelKey: selectedModelKey,
      settings: videoSettings,
      prompt: finalPrompt,
      shotId
    });

    if (onJobSubmitted && selectedNode) {
      onJobSubmitted(job, selectedNode.id);
    }
  };

  // Batch submit all shots in director plan
  const handleBatchSubmitAllShots = async () => {
    if (!directorPlan || directorPlan.shots.length === 0) return;
    setIsBatchSubmitting(true);
    try {
      for (const shot of directorPlan.shots) {
        await handleSubmitDirectVideo(shot.prompt, shot.shotId, shot.keyframeImageUrl);
      }
    } catch (err: any) {
      console.warn('Batch submit warning:', err);
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  return (
    <aside
      id="video-creation-panel"
      className="fixed top-14 right-0 bottom-0 w-[440px] bg-white border-l border-neutral-200 shadow-2xl z-40 flex flex-col font-sans"
    >
      {/* Hidden file input for uploading reference image */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100 bg-neutral-50/80">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-purple-600" />
          <span className="text-xs text-neutral-400 font-medium">万能画布</span>
          <span className="text-xs text-neutral-300">/</span>
          <span className="text-sm font-semibold text-neutral-900">影视级视频创作</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center border-b border-neutral-200 px-4 mt-2">
        <button
          onClick={() => setActiveTab('product_showcase')}
          className={`pb-2.5 pt-1 px-3 text-xs font-medium border-b-2 transition ${
            activeTab === 'product_showcase'
              ? 'border-purple-600 text-purple-700 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          产品展示 (AI导演脚本)
        </button>
        <button
          onClick={() => setActiveTab('generate_video')}
          className={`pb-2.5 pt-1 px-3 text-xs font-medium border-b-2 transition ${
            activeTab === 'generate_video'
              ? 'border-purple-600 text-purple-700 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          直接生成视频
        </button>
        <div className="pb-2.5 pt-1 px-2 text-xs font-medium text-neutral-300 flex items-center gap-1 cursor-not-allowed">
          <span>带货视频</span>
          <span className="text-[9px] px-1 py-0.2 bg-neutral-100 text-neutral-400 rounded">V2</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Style Selector (Only for product_showcase) */}
        {activeTab === 'product_showcase' && (
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">运镜模式</label>
            <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setStyle('single_take')}
                className={`py-1.5 px-3 rounded text-xs font-medium transition ${
                  style === 'single_take'
                    ? 'bg-white text-purple-900 shadow-sm font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                一镜到底 (连贯大景深)
              </button>
              <button
                type="button"
                onClick={() => setStyle('smart_mix')}
                className={`py-1.5 px-3 rounded text-xs font-medium transition ${
                  style === 'smart_mix'
                    ? 'bg-white text-purple-900 shadow-sm font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                智能混剪 (3分镜细节特写)
              </button>
            </div>
          </div>
        )}

        {/* Reference Images Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-neutral-700 flex items-center gap-1">
              <span>参考商品图片</span>
              <span className="text-[11px] text-neutral-400 font-normal">
                ({referenceImages.length} 张已选)
              </span>
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 font-medium"
            >
              {isUploadingImage ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>上传中...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3" />
                  <span>添加参考图</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {referenceImages.map((img, idx) => (
              <div
                key={img.id}
                className="group relative flex items-center gap-2 p-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition"
              >
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-9 h-9 rounded object-cover border border-neutral-300 shadow-2xs"
                />
                <div className="min-w-0 pr-5">
                  <div className="text-[11px] font-medium text-neutral-800 truncate max-w-[110px]">
                    {img.title || `@参考图 ${idx + 1}`}
                  </div>
                  <div className="text-[9px] text-emerald-600 font-mono">
                    {idx === 0 ? '首选主图' : '辅视图'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveReferenceImage(img.id)}
                  className="absolute top-1 right-1 p-0.5 text-neutral-400 hover:text-rose-600 rounded"
                  title="移除此图"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {referenceImages.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-3 border border-dashed border-neutral-300 hover:border-purple-400 rounded-lg text-xs text-neutral-500 hover:text-purple-700 flex items-center justify-center gap-1.5 transition bg-neutral-50/50"
              >
                <ImageIcon className="w-4 h-4 text-neutral-400" />
                <span>点击添加商品参考图 (支持电脑本地图片)</span>
              </button>
            )}
          </div>
        </div>

        {/* Product Title / DNA */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">商品名称与品类特征</label>
          <input
            type="text"
            value={productTitle}
            onChange={e => setProductTitle(e.target.value)}
            placeholder="例如：现代意式轻奢真皮功能沙发"
            className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
          />
        </div>

        {/* Focus Points (Multi-select Chips) */}
        {activeTab === 'product_showcase' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-700 flex items-center gap-1">
                <span>展示重点 (多选)</span>
                <span className="text-[11px] text-neutral-400 font-normal">
                  已选 {selectedFocusPoints.length} 项
                </span>
              </label>
              <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium">
                将深度对齐运镜分镜
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {focusPointsList.map(point => {
                const isSelected = selectedFocusPoints.includes(point);
                return (
                  <button
                    key={point}
                    type="button"
                    onClick={() => handleToggleFocusPoint(point)}
                    className={`text-xs px-2.5 py-1 rounded-md transition flex items-center gap-1 border ${
                      isSelected
                        ? 'bg-purple-50 text-purple-800 border-purple-300 font-medium shadow-2xs'
                        : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:text-neutral-900'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-purple-600 stroke-[3]" />}
                    <span>{point}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Focus Point input */}
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={customFocusInput}
                onChange={e => setCustomFocusInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomFocusPoint())}
                placeholder="+ 输入自定义展示重点 (回车添加)"
                className="flex-1 text-xs px-2.5 py-1.5 border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
              <button
                type="button"
                onClick={handleAddCustomFocusPoint}
                className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md text-xs font-medium transition"
              >
                添加
              </button>
            </div>
          </div>
        )}

        {/* Script / Director LLM Model Selector */}
        {activeTab === 'product_showcase' && (
          <div className="pt-2 border-t border-neutral-100">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                <span>分镜文案模型 (Director LLM)</span>
              </label>
              <span className="text-[10px] text-neutral-400">词元流墟高规格通道</span>
            </div>

            <select
              value={selectedDirectorModel}
              onChange={e => setSelectedDirectorModel(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 bg-white"
            >
              {DIRECTOR_MODELS.map(m => (
                <option key={m.key} value={m.key}>
                  {m.name} [{m.tag}] - {m.desc}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Video Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-neutral-700">创意描述 / 运镜定制要求</label>
            <button
              type="button"
              onClick={handleExpandPrompt}
              className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 font-medium"
            >
              <Sparkles className="w-3 h-3" />
              <span>AI扩写融合重点</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={userPrompt}
            onChange={e => setUserPrompt(e.target.value)}
            placeholder="描述你想呈现的镜头画面，如：镜头缓慢向右平移，室内晨光洒在沙发扶手边缘..."
            className="w-full text-xs p-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 resize-none leading-relaxed"
          />
        </div>

        {/* Video Synthesis Model and Settings (For direct or fine-tuning) */}
        <div className="space-y-3 pt-2 border-t border-neutral-100">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-neutral-600" />
              <span>视频生成模型 (Video Engine)</span>
            </label>
            <select
              value={selectedModelKey}
              onChange={e => {
                const newKey = e.target.value;
                setSelectedModelKey(newKey);
                const newCap = capabilities.find(c => c.key === newKey);
                if (newCap && newCap.variants.length > 0) {
                  const firstVar = newCap.variants[0];
                  setVideoSettings(prev => ({
                    ...prev,
                    durationSeconds: firstVar.durationSeconds,
                    resolution: firstVar.resolution
                  }));
                }
              }}
              className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 bg-white"
            >
              {capabilities.map(cap => (
                <option key={cap.key} value={cap.key}>
                  {cap.displayName} ({cap.exactModelId})
                </option>
              ))}
            </select>
            {currentCapability && (
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className={`w-3 h-3 ${currentCapability.tested ? 'text-emerald-600' : 'text-amber-500'}`} />
                  <span>实测状态: {currentCapability.tested ? '测试通过' : '可用'}</span>
                </div>
                {currentCapability.key.startsWith('sd-') && (
                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-medium">
                    推荐 · 秒级出片
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">时长</label>
              <select
                value={videoSettings.durationSeconds}
                onChange={e =>
                  setVideoSettings(prev => ({ ...prev, durationSeconds: Number(e.target.value) }))
                }
                className="w-full text-xs px-2.5 py-1.5 border border-neutral-200 rounded-md bg-white"
              >
                {(() => {
                  const durations = Array.from(
                    new Set((currentCapability?.variants || []).map(v => v.durationSeconds))
                  ).sort((a, b) => a - b);
                  const validDurations = durations.length > 0 ? durations : [5, 10];
                  return validDurations.map(sec => (
                    <option key={sec} value={sec}>
                      {sec} 秒
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">分辨率</label>
              <select
                value={videoSettings.resolution}
                onChange={e =>
                  setVideoSettings(prev => ({ ...prev, resolution: e.target.value }))
                }
                className="w-full text-xs px-2.5 py-1.5 border border-neutral-200 rounded-md bg-white"
              >
                {(() => {
                  const resolutions = Array.from(
                    new Set((currentCapability?.variants || []).map(v => v.resolution))
                  );
                  const validResolutions = resolutions.length > 0 ? resolutions : ['720p', '1080p'];
                  return validResolutions.map(res => (
                    <option key={res} value={res}>
                      {res === '1080p' ? '1080p 超清' : `${res} 高清`}
                    </option>
                  ));
                })()}
              </select>
            </div>
          </div>
        </div>

        {/* Director Brief Plan Display */}
        {directorPlan && (
          <div className="pt-3 border-t border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-purple-600" />
                <span>导演分镜方案 ({directorPlan.shots.length} 个镜头)</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-700 font-medium rounded-full">
                总长 {directorPlan.estimatedDurationSeconds}s · 模型: {directorPlan.directorModel}
              </span>
            </div>

            <p className="text-[11px] text-neutral-600 leading-relaxed bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
              {directorPlan.summary}
            </p>

            {/* Invariants */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-neutral-500">产品保真与运镜准则:</span>
              {directorPlan.lockedRules.slice(0, 3).map((rule, idx) => (
                <div key={idx} className="flex items-start gap-1 text-[10px] text-neutral-600">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>

            {/* Shots List */}
            <div className="space-y-2.5">
              {directorPlan.shots.map(shot => {
                const isGeneratingKeyframe = generatingKeyframeShotId === shot.shotId;
                return (
                  <div
                    key={shot.shotId}
                    className="p-3 border border-neutral-200 rounded-lg space-y-2 bg-white shadow-2xs hover:border-purple-200 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-900">
                        {shot.order}. {shot.title}
                      </span>
                      <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-mono">
                        {shot.durationSeconds}s
                      </span>
                    </div>

                    <div className="text-[10px] text-neutral-500 grid grid-cols-2 gap-1.5 bg-neutral-50 p-1.5 rounded">
                      <div>构图: <span className="text-neutral-700">{shot.composition}</span></div>
                      <div>运镜: <span className="text-neutral-700">{shot.cameraMotion}</span></div>
                    </div>

                    <div className="text-[10px] text-neutral-600 line-clamp-2 italic">
                      "{shot.prompt}"
                    </div>

                    {/* Keyframe image if generated */}
                    {shot.keyframeImageUrl && (
                      <div className="relative rounded overflow-hidden border border-purple-200">
                        <img
                          src={shot.keyframeImageUrl}
                          alt="Keyframe"
                          className="w-full h-24 object-cover"
                        />
                        <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                          首帧画面已锁定
                        </span>
                      </div>
                    )}

                    {/* Shot Action Buttons: Generate Keyframe OR Direct Video */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleGenerateKeyframe(shot)}
                        disabled={isGeneratingKeyframe}
                        className="py-1.5 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {isGeneratingKeyframe ? (
                          <>
                            <RotateCw className="w-3 h-3 animate-spin text-purple-600" />
                            <span>生成画面中...</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3 h-3 text-purple-600" />
                            <span>先生成首帧画面</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSubmitDirectVideo(shot.prompt, shot.shotId, shot.keyframeImageUrl)}
                        disabled={isSubmittingJob}
                        className="py-1.5 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-[11px] font-medium transition flex items-center justify-center gap-1 shadow-2xs disabled:opacity-50"
                      >
                        <Play className="w-3 h-3" />
                        <span>生成此分镜视频</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Batch generation of all shots */}
            {directorPlan.shots.length > 1 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleBatchSubmitAllShots}
                  disabled={isBatchSubmitting || isSubmittingJob}
                  className="w-full py-2 px-3 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isBatchSubmitting ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在批量排队提交...</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>一键批量生成全部 {directorPlan.shots.length} 个分镜视频</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-tight">{error}</div>
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="p-4 border-t border-neutral-200 bg-neutral-50/50 space-y-2">
        {activeTab === 'product_showcase' ? (
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={isGeneratingPlan || (referenceImages.length === 0 && !selectedNode)}
            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5"
          >
            {isGeneratingPlan ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>导演正在构思运镜方案 ({selectedDirectorModel})...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>生成视频策划分镜方案</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSubmitDirectVideo()}
            disabled={isSubmittingJob || (referenceImages.length === 0 && !selectedNode)}
            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5"
          >
            {isSubmittingJob ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>正在排队下发视频任务...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>开始生成视频</span>
              </>
            )}
          </button>
        )}

        {/* Active Tasks Status Drawer */}
        {jobs.length > 0 && (
          <div className="pt-2 border-t border-neutral-200">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
              <span>近期任务 ({jobs.length})</span>
              {storageInfo && (
                <span className="text-[10px] text-neutral-400">
                  存储: {storageInfo.provider === 'gcs' ? 'GCS私有桶 + Supabase' : '云端与本地双重备份'}
                </span>
              )}
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1">
              {jobs.slice(0, 3).map(job => (
                <div
                  key={job.id}
                  className="flex items-center justify-between px-2 py-1 bg-white border border-neutral-200 rounded text-[10px]"
                >
                  <span className="font-mono text-neutral-600 truncate max-w-[120px]">{job.id}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded font-medium ${
                        job.status === 'ready'
                          ? 'bg-emerald-100 text-emerald-800'
                          : job.status === 'transferring'
                          ? 'bg-blue-100 text-blue-800'
                          : job.status === 'running'
                          ? 'bg-amber-100 text-amber-800'
                          : job.status === 'transfer_failed'
                          ? 'bg-rose-100 text-rose-800'
                          : job.status === 'failed' || job.status === 'submission_unknown'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                      title={job.errorMessage || ''}
                    >
                      {job.status === 'ready'
                        ? '就绪'
                        : job.status === 'transferring'
                        ? '转存中'
                        : job.status === 'running'
                        ? `生成中 ${job.progressPercent || 0}%`
                        : job.status === 'transfer_failed'
                        ? '转存失败'
                        : job.status === 'failed'
                        ? '生成失败'
                        : job.status === 'submission_unknown'
                        ? '提交异常'
                        : '排队中'}
                    </span>
                    {job.status === 'transfer_failed' && (
                      <button
                        onClick={() => retryTransfer(job.id)}
                        className="text-indigo-600 hover:underline"
                      >
                        重试转存
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
