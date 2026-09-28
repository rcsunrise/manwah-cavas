// src/features/space-studio/components/ShootPhaseWorkspace.tsx
// MANWAH Space Studio｜SHOOT 阶段生产型工作台 (V3.1 严格对标参考图 3 & 6)
import React, { useState, useMemo } from 'react';
import {
  ShotInstance,
  SceneMaster,
  ProductAsset,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  GenerationJob,
  GenerationSettings,
  ShotRevision
} from '../../../types/spaceStudio';
import { SPACE_IMAGE_MODELS, getModelById } from '../../../config/imageModelRegistry';
import { ShootCompiler } from '../engine/shootCompiler';
import {
  Camera,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sparkles,
  Layers,
  Eye,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Crosshair,
  Settings2,
  HelpCircle,
  Copy,
  Undo2,
  Image as ImageIcon,
  Compass,
  FileCode,
  History,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottomClose,
  PanelBottomOpen
} from 'lucide-react';

interface ShootPhaseWorkspaceProps {
  shots: ShotInstance[];
  activeShot: ShotInstance;
  sceneMaster?: SceneMaster;
  products: ProductAsset[];
  selectedSpace: SpacePreset;
  selectedStyle: StylePreset;
  blueprint: PlacementBlueprint;
  isSceneMasterLocked: boolean;
  activeJob?: GenerationJob;
  isLeftCollapsed?: boolean;
  onToggleLeftCollapse?: () => void;
  isRightCollapsed?: boolean;
  onToggleRightCollapse?: () => void;
  isBottomCollapsed?: boolean;
  onToggleBottomCollapse?: () => void;
  onSelectShot: (shotId: string) => void;
  onUpdateCamera: (shotId: string, updates: Partial<ShotInstance['camera']>) => void;
  onRenderCurrentShot: (settings: GenerationSettings) => Promise<void>;
  onBatchRenderAll: () => Promise<void>;
  onRollbackRevision: (shotId: string, revisionId: string) => void;
  onConfirmProductionTruth?: (revision: ShotRevision) => void;
}

export const ShootPhaseWorkspace: React.FC<ShootPhaseWorkspaceProps> = ({
  shots,
  activeShot,
  sceneMaster,
  products,
  selectedSpace,
  selectedStyle,
  blueprint,
  isSceneMasterLocked,
  activeJob,
  isLeftCollapsed: isLeftCollapsedProp,
  onToggleLeftCollapse,
  isRightCollapsed: isRightCollapsedProp,
  onToggleRightCollapse,
  isBottomCollapsed: isBottomCollapsedProp,
  onToggleBottomCollapse,
  onSelectShot,
  onUpdateCamera,
  onRenderCurrentShot,
  onBatchRenderAll,
  onRollbackRevision,
  onConfirmProductionTruth
}) => {
  // 两侧及底部折叠状态管理 (支持外部受控或内部默认)
  const [internalLeftCollapsed, setInternalLeftCollapsed] = useState(false);
  const [internalRightCollapsed, setInternalRightCollapsed] = useState(false);
  const [internalBottomCollapsed, setInternalBottomCollapsed] = useState(false);

  const leftCollapsed = isLeftCollapsedProp !== undefined ? isLeftCollapsedProp : internalLeftCollapsed;
  const rightCollapsed = isRightCollapsedProp !== undefined ? isRightCollapsedProp : internalRightCollapsed;
  const bottomCollapsed = isBottomCollapsedProp !== undefined ? isBottomCollapsedProp : internalBottomCollapsed;

  const toggleLeft = onToggleLeftCollapse || (() => setInternalLeftCollapsed((prev) => !prev));
  const toggleRight = onToggleRightCollapse || (() => setInternalRightCollapsed((prev) => !prev));
  const toggleBottom = onToggleBottomCollapse || (() => setInternalBottomCollapsed((prev) => !prev));

  // Generation Settings 状态
  const [selectedTemplate, setSelectedTemplate] = useState<string>('commercial-hero');
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3.1-flash-image-preview');
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K');
  const [aspectRatio, setAspectRatio] = useState<string>('4:3');
  const [useRandomSeed, setUseRandomSeed] = useState<boolean>(true);
  const [customSeed, setCustomSeed] = useState<number>(428912);

  // Must Include / Exclude 标签
  const [mustIncludes, setMustIncludes] = useState<string[]>([
    '敏华半苯胺头层牛皮微孔',
    '双针绗缝手工车线',
    '电动展开机械骨架',
    '巴西潘多拉奢石台面'
  ]);
  const [mustNotIncludes, setMustNotIncludes] = useState<string[]>([
    '家具位置漂移',
    '透视畸变变形',
    '非敏华皮质',
    '人物面孔杂物'
  ]);
  const [newIncludeTag, setNewIncludeTag] = useState('');
  const [newExcludeTag, setNewExcludeTag] = useState('');

  // 锁状态
  const [invarianceLocks, setInvarianceLocks] = useState({
    productIdentity: true,
    placement: true,
    architecture: true,
    style: true,
    material: true,
    lighting: true,
    cameraDecoupled: true,
    humanPass: false
  });

  // 折叠面板状态
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // 顶部弹窗视图切换
  const [modalView, setModalView] = useState<'none' | 'ref' | 'blueprint' | 'cameraDna' | 'compare' | 'fullscreen'>('none');

  const selectedModel = useMemo(() => getModelById(selectedModelId), [selectedModelId]);

  // 动态编译提示词快照
  const compiledPrompt = useMemo(() => {
    return ShootCompiler.compileShotPrompt({
      shot: {
        ...activeShot,
        camera: {
          ...activeShot.camera,
          mustInclude: mustIncludes,
          mustExclude: mustNotIncludes
        }
      },
      sceneMaster: sceneMaster || {
        id: 'master-dummy',
        projectId: 'project',
        objectKey: '',
        isLocked: false,
        locks: {
          productIdentity: true,
          placement: true,
          architecture: true,
          style: true,
          material: true,
          lighting: true,
          camera: true,
          human: false
        },
        promptSnapshotId: 'snap-0'
      },
      products,
      spacePreset: selectedSpace,
      stylePreset: selectedStyle,
      blueprint
    });
  }, [activeShot, sceneMaster, products, selectedSpace, selectedStyle, blueprint, mustIncludes, mustNotIncludes]);

  // 当前激活 Revision
  const currentRevision = useMemo(() => {
    if (!activeShot.revisions || activeShot.revisions.length === 0) return null;
    if (activeShot.currentRevisionId) {
      return activeShot.revisions.find((r) => r.id === activeShot.currentRevisionId) || activeShot.revisions[0];
    }
    return activeShot.revisions[0];
  }, [activeShot]);

  const activeIndex = shots.findIndex((s) => s.id === activeShot.id);
  const isJobRunning = activeJob && (activeJob.status === 'compiling' || activeJob.status === 'generating' || activeJob.status === 'storing' || activeJob.status === 'judging');

  const handleGenerate = () => {
    onRenderCurrentShot({
      templateId: selectedTemplate,
      model: selectedModelId,
      resolution,
      aspectRatio,
      seed: useRandomSeed ? undefined : customSeed,
      useRandomSeed
    });
  };

  const handlePrevShot = () => {
    if (activeIndex > 0) {
      onSelectShot(shots[activeIndex - 1].id);
    }
  };

  const handleNextShot = () => {
    if (activeIndex < shots.length - 1) {
      onSelectShot(shots[activeIndex + 1].id);
    }
  };

  const handleAddInclude = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newIncludeTag.trim()) {
      if (!mustIncludes.includes(newIncludeTag.trim())) {
        setMustIncludes([...mustIncludes, newIncludeTag.trim()]);
      }
      setNewIncludeTag('');
    }
  };

  const handleAddExclude = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newExcludeTag.trim()) {
      if (!mustNotIncludes.includes(newExcludeTag.trim())) {
        setMustNotIncludes([...mustNotIncludes, newExcludeTag.trim()]);
      }
      setNewExcludeTag('');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF8F5] text-stone-900 overflow-hidden select-none font-sans">
      {/* 核心三栏生产区 (LEFT - CENTER - RIGHT) */}
      <div className="flex-1 flex overflow-hidden">
        {/* ===================== LEFT: 镜头列表与规格 ===================== */}
        <aside
          className={`${
            leftCollapsed
              ? 'w-0 overflow-hidden opacity-0 pointer-events-none'
              : 'w-80 bg-white border-r border-[#EBE7E0] flex flex-col shrink-0'
          } transition-all duration-300 relative`}
        >
          <div className="p-3.5 border-b border-[#EBE7E0] flex items-center justify-between bg-[#FAF8F5] shrink-0">
            <div>
              <h3 className="font-bold text-stone-800 text-[13px] flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-amber-600" />
                <span>镜头群组序列</span>
              </h3>
              <p className="text-[10px] text-stone-500 mt-0.5">A00 空间母版 · A01-A08 衍生机位</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 font-mono font-bold">
                {shots.length} SHOTS
              </span>
              <button
                type="button"
                onClick={toggleLeft}
                className="p-1 rounded-md hover:bg-stone-200/70 text-stone-400 hover:text-stone-700 transition"
                title="折叠左侧镜头列表 (放大中间渲染区)"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 镜头列表项 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {shots.map((shot) => {
              const isSelected = shot.id === activeShot.id;
              const hasPassed = shot.status === 'passed';
              const isGenerating = shot.status === 'generating';
              const isFailed = shot.status === 'failed';
              const headRev = shot.revisions?.[0];

              return (
                <div
                  key={shot.id}
                  onClick={() => onSelectShot(shot.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all border text-left relative ${
                    isSelected
                      ? 'bg-amber-50/70 border-amber-500 ring-1 ring-amber-400/30 shadow-xs'
                      : 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-amber-900 bg-white px-1.5 py-0.5 rounded border border-stone-200 shadow-2xs">
                        {shot.templateCode}
                      </span>
                      <div>
                        <div className="font-semibold text-stone-800 text-xs line-clamp-1">{shot.name}</div>
                        <div className="text-[10px] text-stone-500 line-clamp-1">{shot.intent?.name || '标准空间视角'}</div>
                      </div>
                    </div>

                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium shrink-0 ${
                        hasPassed
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : isGenerating
                          ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                          : isFailed
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-stone-200/80 text-stone-600'
                      }`}
                    >
                      {hasPassed ? 'L2 PASS' : isGenerating ? '渲染中...' : isFailed ? 'FAILED' : 'DRAFT'}
                    </span>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-stone-200/60 flex items-center justify-between text-[10px] text-stone-500 font-mono">
                    <span className="flex items-center gap-1">
                      <span>{shot.camera.lensMm}mm</span>
                      <span>·</span>
                      <span>H:{shot.camera.heightCm}cm</span>
                      <span>·</span>
                      <span>Yaw:{shot.camera.yawDeg}°</span>
                    </span>
                    <span className="text-amber-800 font-bold bg-amber-100/60 px-1 py-0.2 rounded text-[9px]">
                      {shot.revisions.length} REV
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部当前选中镜头规格卡片 */}
          <div className="p-3.5 border-t border-[#EBE7E0] bg-[#FAF8F5] space-y-2 shrink-0 text-xs">
            <div className="flex items-center justify-between font-bold text-stone-800 text-[11px]">
              <span className="flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-amber-600" />
                <span>当前机位物理参数</span>
              </span>
              <span className="font-mono text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded text-[10px]">
                {activeShot.templateCode}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
              <div className="bg-white p-1.5 rounded border border-stone-200 flex justify-between">
                <span className="text-stone-400">焦段 Lens:</span>
                <span className="font-bold text-stone-800">{activeShot.camera.lensMm}mm</span>
              </div>
              <div className="bg-white p-1.5 rounded border border-stone-200 flex justify-between">
                <span className="text-stone-400">机位 Height:</span>
                <span className="font-bold text-stone-800">{activeShot.camera.heightCm}cm</span>
              </div>
              <div className="bg-white p-1.5 rounded border border-stone-200 flex justify-between">
                <span className="text-stone-400">水平 Yaw:</span>
                <span className="font-bold text-stone-800">{activeShot.camera.yawDeg}°</span>
              </div>
              <div className="bg-white p-1.5 rounded border border-stone-200 flex justify-between">
                <span className="text-stone-400">俯仰 Pitch:</span>
                <span className="font-bold text-stone-800">{activeShot.camera.pitchDeg}°</span>
              </div>
            </div>

            <div className="flex items-center gap-1 pt-1">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100/70 text-amber-900 border border-amber-200 font-medium">
                Fixed Furniture
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100/70 text-emerald-900 border border-emerald-200 font-medium">
                Zero Translation
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200 font-medium">
                Decoupled
              </span>
            </div>
          </div>
        </aside>

        {/* ===================== CENTER: 视窗画幅与 HUD ===================== */}
        <main className="flex-1 flex flex-col bg-[#F3EFEA] relative overflow-hidden">
          {/* 顶部工具栏: 镜头编号名称, 版本下拉, 辅助视图切换 */}
          <div className="h-12 bg-white/90 backdrop-blur-md border-b border-[#EBE7E0] px-4 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 bg-stone-900 text-amber-300 rounded shadow-2xs">
                  {activeShot.templateCode}
                </span>
                <span className="font-bold text-stone-800 text-xs">{activeShot.name}</span>
              </div>

              {/* 当前版本下拉 */}
              {activeShot.revisions.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[10px] text-stone-400">版本:</span>
                  <select
                    value={activeShot.currentRevisionId || activeShot.revisions[0]?.id}
                    onChange={(e) => onRollbackRevision(activeShot.id, e.target.value)}
                    className="bg-[#FAF8F5] border border-stone-300 text-stone-800 rounded px-2 py-1 text-[11px] font-mono font-medium focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                  >
                    {activeShot.revisions.map((rev) => (
                      <option key={rev.id} value={rev.id}>
                        Rev {rev.revisionNumber} ({rev.status === 'approved' ? 'PASS' : rev.status}) - {rev.provenance}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 快捷视图切换栏 */}
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setModalView(modalView === 'ref' ? 'none' : 'ref')}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium transition flex items-center gap-1 ${
                  modalView === 'ref'
                    ? 'bg-stone-900 text-amber-300 border-stone-900'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>参考图</span>
              </button>

              <button
                onClick={() => setModalView(modalView === 'blueprint' ? 'none' : 'blueprint')}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium transition flex items-center gap-1 ${
                  modalView === 'blueprint'
                    ? 'bg-stone-900 text-amber-300 border-stone-900'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>平面布局</span>
              </button>

              <button
                onClick={() => setModalView(modalView === 'cameraDna' ? 'none' : 'cameraDna')}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium transition flex items-center gap-1 ${
                  modalView === 'cameraDna'
                    ? 'bg-stone-900 text-amber-300 border-stone-900'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Camera DNA</span>
              </button>

              <button
                onClick={() => setModalView(modalView === 'compare' ? 'none' : 'compare')}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium transition flex items-center gap-1 ${
                  modalView === 'compare'
                    ? 'bg-stone-900 text-amber-300 border-stone-900'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>母版对比</span>
              </button>

              <button
                onClick={() => setModalView(modalView === 'fullscreen' ? 'none' : 'fullscreen')}
                className="p-1 rounded border border-stone-300 hover:bg-stone-100 text-stone-600 ml-1"
                title="全屏预览"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <div className="h-3 w-px bg-stone-200 mx-0.5" />

              {/* 视窗左右两翼与底轨折叠快捷控制 */}
              <div className="flex items-center gap-0.5 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                <button
                  type="button"
                  onClick={toggleLeft}
                  className={`p-1 rounded transition ${
                    leftCollapsed ? 'bg-amber-100 text-amber-800' : 'text-stone-500 hover:text-stone-800'
                  }`}
                  title={leftCollapsed ? '展开左侧镜头列表' : '折叠左侧镜头列表'}
                >
                  {leftCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={toggleRight}
                  className={`p-1 rounded transition ${
                    rightCollapsed ? 'bg-amber-100 text-amber-800' : 'text-stone-500 hover:text-stone-800'
                  }`}
                  title={rightCollapsed ? '展开右侧机位设置' : '折叠右侧机位设置'}
                >
                  {rightCollapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={toggleBottom}
                  className={`p-1 rounded transition ${
                    bottomCollapsed ? 'bg-amber-100 text-amber-800' : 'text-stone-500 hover:text-stone-800'
                  }`}
                  title={bottomCollapsed ? '展开底部镜头序列轨' : '折叠底部镜头序列轨'}
                >
                  {bottomCollapsed ? <PanelBottomOpen className="w-3.5 h-3.5" /> : <PanelBottomClose className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* 中央主视窗画幅 (3:4 高定画幅，支持自适应扩展) */}
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden transition-all duration-300">
            {/* 左侧折叠时浮动展开按钮 */}
            {leftCollapsed && (
              <button
                type="button"
                onClick={toggleLeft}
                className="absolute left-3 top-4 z-20 px-2.5 py-1.5 rounded-xl bg-white/95 backdrop-blur-md shadow-md border border-stone-200 text-stone-700 hover:text-amber-800 hover:border-amber-400 transition flex items-center gap-1.5 text-xs font-semibold group cursor-pointer"
                title="展开左侧镜头序列"
              >
                <PanelLeftOpen className="w-4 h-4 text-stone-500 group-hover:text-amber-600 transition" />
                <span>展开镜头</span>
              </button>
            )}

            {/* 右侧折叠时浮动展开按钮 */}
            {rightCollapsed && (
              <button
                type="button"
                onClick={toggleRight}
                className="absolute right-3 top-4 z-20 px-2.5 py-1.5 rounded-xl bg-white/95 backdrop-blur-md shadow-md border border-stone-200 text-stone-700 hover:text-amber-800 hover:border-amber-400 transition flex items-center gap-1.5 text-xs font-semibold group cursor-pointer"
                title="展开右侧生成设置与机位DNA"
              >
                <span>展开设置</span>
                <PanelRightOpen className="w-4 h-4 text-stone-500 group-hover:text-amber-600 transition" />
              </button>
            )}

            <div
              className={`aspect-[3/4] bg-white rounded-2xl shadow-xl border border-[#DFD8CE] flex flex-col items-center justify-center relative overflow-hidden group transition-all duration-300 ${
                bottomCollapsed ? 'max-h-[96%]' : 'max-h-[92%]'
              } ${
                leftCollapsed && rightCollapsed
                  ? 'w-full max-w-[760px] xl:max-w-[840px]'
                  : leftCollapsed || rightCollapsed
                  ? 'w-full max-w-[620px] lg:max-w-[680px]'
                  : 'w-[480px]'
              }`}
            >
              {/* 图像显示层 */}
              {currentRevision?.imageUrl ? (
                <img
                  src={currentRevision.imageUrl}
                  alt={activeShot.name}
                  className="w-full h-full object-cover select-none"
                  referrerPolicy="no-referrer"
                />
              ) : (
                // 无图片时的真实状态反馈 (严格遵守 Requirement 4: 没有真实 provider response 时一律显示 NOT GENERATED / PROVIDER UNAVAILABLE / FAILED)
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 bg-[#FAF8F5] w-full h-full">
                  <div className="w-14 h-14 rounded-2xl bg-amber-100/70 border border-amber-200 flex items-center justify-center text-amber-800">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-stone-800 text-xs tracking-wide">
                      {isJobRunning
                        ? 'RENDER RUNNING 渲染任务执行中...'
                        : !isSceneMasterLocked
                        ? 'GATE BLOCKED 门禁未开启'
                        : activeShot.status === 'failed'
                        ? 'FAILED 渲染未就绪'
                        : 'NOT GENERATED 待渲染镜头'}
                    </div>
                    <p className="text-[11px] text-stone-500 max-w-xs leading-relaxed">
                      {!isSceneMasterLocked
                        ? 'A00 空间母版尚未锁定。第一性原理：未锁母版禁止生成 A01-A08 衍生镜头。'
                        : isJobRunning
                        ? `任务进度 ${activeJob?.progress || 0}% · 状态: ${activeJob?.status}`
                        : activeJob?.error
                        ? activeJob.error
                        : '当前镜头尚未调用模型生成。点击右下角“生成当前镜头”以启动标准工作流。'}
                    </p>
                  </div>

                  {!isSceneMasterLocked && (
                    <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-900 font-medium">
                      请先在 01 BUILD 阶段生成并锁定 A00 母版
                    </div>
                  )}
                </div>
              )}

              {/* 悬浮实景镜头 HUD (按参考图 3 & 6 像素级还原) */}
              <div className="absolute top-3.5 left-3.5 flex flex-col gap-1 z-10 font-mono text-[10px] pointer-events-none">
                <div className="px-2.5 py-1 rounded-md bg-stone-950/80 backdrop-blur-md text-amber-300 border border-stone-800/80 shadow-md">
                  Lens {activeShot.camera.lensMm}mm
                </div>
                <div className="px-2.5 py-1 rounded-md bg-stone-950/80 backdrop-blur-md text-stone-200 border border-stone-800/80 shadow-md">
                  Height {activeShot.camera.heightCm}cm
                </div>
                <div className="px-2.5 py-1 rounded-md bg-stone-950/80 backdrop-blur-md text-stone-200 border border-stone-800/80 shadow-md">
                  Yaw {activeShot.camera.yawDeg}°
                </div>
              </div>

              {/* 画面中心十字准星 HUD (对焦指示器) */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 opacity-70 group-hover:opacity-100 transition-opacity">
                <div className="relative flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border border-amber-400/60 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-amber-400/80" />
                  </div>
                  <div className="absolute w-16 h-px bg-amber-400/50" />
                  <div className="absolute h-16 w-px bg-amber-400/50" />
                </div>
                <div className="mt-2 px-2 py-0.5 rounded bg-stone-950/80 backdrop-blur-md text-amber-300 text-[10px] font-mono border border-stone-800 shadow-md">
                  Focus: {activeShot.camera.target?.id || '三人位主沙发中心'}
                </div>
              </div>

              {/* 右下角徽标: Camera Move Only 仅移动摄影机 */}
              <div className="absolute bottom-3.5 right-3.5 z-10 font-mono text-[10px]">
                <div className="px-2.5 py-1 rounded-md bg-stone-950/85 backdrop-blur-md text-amber-400 border border-amber-500/40 shadow-md flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Camera Move Only 仅移动摄影机</span>
                </div>
              </div>

              {/* 左下角多模态裁判 L2 审核指示条 */}
              {currentRevision?.validationReport && (
                <div className="absolute bottom-3.5 left-3.5 z-10 font-mono text-[10px]">
                  <div
                    className={`px-2.5 py-1 rounded-md backdrop-blur-md border shadow-md flex items-center gap-1.5 ${
                      currentRevision.validationReport.pass
                        ? 'bg-emerald-950/85 text-emerald-300 border-emerald-600/50'
                        : 'bg-rose-950/85 text-rose-300 border-rose-600/50'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {currentRevision.validationReport.pass ? 'L2 PASS' : 'L2 GATE BLOCKED'} (
                      {currentRevision.validationReport.score?.overall || 0}分)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===================== BOTTOM: A00-A08 缩略图序列轨 - 支持折叠 ===================== */}
          <div
            className={`${
              bottomCollapsed
                ? 'h-0 overflow-hidden border-t-0 opacity-0 pointer-events-none'
                : 'h-28 bg-white border-t border-[#EBE7E0] px-4 opacity-100'
            } flex items-center gap-3 z-10 shrink-0 transition-all duration-300 relative`}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleBottom()}
                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition mr-1"
                title="折叠底部镜头序列轨"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handlePrevShot}
                disabled={activeIndex <= 0}
                className="p-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed text-stone-600"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* 缩略图序列 */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto py-2">
              {shots.map((shot, idx) => {
                const isSelected = shot.id === activeShot.id;
                const rev = shot.revisions?.[0];
                return (
                  <button
                    key={shot.id}
                    onClick={() => onSelectShot(shot.id)}
                    className={`h-20 w-16 rounded-xl border flex flex-col items-center justify-between p-1.5 transition shrink-0 relative overflow-hidden ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-400/40'
                        : 'border-stone-200 bg-[#FAF8F5] hover:border-stone-300'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between text-[9px] font-mono">
                      <span className="font-bold text-stone-700">{shot.templateCode}</span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          shot.status === 'passed'
                            ? 'bg-emerald-500'
                            : shot.status === 'generating'
                            ? 'bg-blue-500 animate-ping'
                            : 'bg-stone-300'
                        }`}
                      />
                    </div>

                    <div className="w-full h-9 rounded bg-stone-200/70 overflow-hidden flex items-center justify-center">
                      {rev?.imageUrl ? (
                        <img
                          src={rev.imageUrl}
                          alt={shot.templateCode}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Camera className="w-3.5 h-3.5 text-stone-400" />
                      )}
                    </div>

                    <span className="text-[8px] font-mono text-stone-500 truncate w-full text-center">
                      {shot.camera.lensMm}mm
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleNextShot}
              disabled={activeIndex >= shots.length - 1}
              className="p-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed text-stone-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="border-l border-stone-200 pl-3 flex items-center gap-2">
              <button
                onClick={onBatchRenderAll}
                disabled={!isSceneMasterLocked || isJobRunning}
                className="px-3 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-amber-300 font-medium rounded-xl text-xs shadow-xs transition flex items-center gap-1.5 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>批量渲染 A01-A08</span>
              </button>
            </div>
          </div>

          {/* 底部折叠状态下的浮动展开条 */}
          {bottomCollapsed && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
              <button
                type="button"
                onClick={toggleBottom}
                className="px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md shadow-md border border-stone-300 hover:border-amber-400 text-stone-700 hover:text-amber-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer group"
                title="展开底部镜头序列轨"
              >
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                <span>展开镜头轨 ({shots.length})</span>
                <ChevronUp className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-600 transition" />
              </button>
            </div>
          )}
        </main>

        {/* ===================== RIGHT: 生成设置与 Camera DNA 编辑中枢 ===================== */}
        <aside
          className={`${
            rightCollapsed
              ? 'w-0 overflow-hidden opacity-0 pointer-events-none'
              : 'w-88 bg-white border-l border-[#EBE7E0] flex flex-col shrink-0 overflow-hidden'
          } transition-all duration-300 relative`}
        >
          {/* 选项卡标题 */}
          <div className="p-3.5 border-b border-[#EBE7E0] bg-[#FAF8F5] flex items-center justify-between shrink-0">
            <h3 className="font-bold text-stone-800 text-[13px] flex items-center gap-1.5">
              <Settings2 className="w-4 h-4 text-amber-600" />
              <span>生成设置与机位 DNA</span>
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-stone-400 font-mono">V3.1 ENGINE</span>
              <button
                type="button"
                onClick={toggleRight}
                className="p-1 rounded-md hover:bg-stone-200/70 text-stone-400 hover:text-stone-700 transition"
                title="折叠右侧调控 (放大中间渲染区)"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* 1. 生成设置 (Generation Settings) */}
            <div className="space-y-3 p-3 bg-[#FAF8F5] rounded-xl border border-stone-200">
              <div className="font-bold text-stone-800 text-xs flex items-center justify-between">
                <span>1. 生成设置 (Generation Settings)</span>
                <span className="text-[10px] font-normal text-amber-800">接 Model Registry</span>
              </div>

              {/* 模板选择 */}
              <div className="space-y-1">
                <label className="text-[11px] text-stone-500 font-medium">预设模板选择</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                >
                  <option value="commercial-hero">商业画册黄金视角 (45° Hero)</option>
                  <option value="ecommerce-macro">电商微距材质特写 (Micro Grain)</option>
                  <option value="space-elevation">大平层低机位纵深 (Architecture)</option>
                  <option value="lifestyle-pairing">茶几与单椅围合交互 (Lifestyle)</option>
                </select>
              </div>

              {/* 生成模型选择 (接 Model Registry) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-stone-500 font-medium">生成模型</label>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold">
                    {selectedModel.badge}
                  </span>
                </div>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-mono focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                >
                  {SPACE_IMAGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-stone-400 mt-0.5">{selectedModel.description}</p>
              </div>

              {/* 精度与比例 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500 font-medium">渲染精度</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['1K', '2K', '4K'] as const).map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setResolution(res)}
                        className={`py-1 rounded text-center text-xs font-mono font-bold border ${
                          resolution === res
                            ? 'bg-amber-500 text-stone-950 border-amber-600'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500 font-medium">图片画幅</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs text-stone-800 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                  >
                    <option value="3:4">3:4 (竖屏海报推荐)</option>
                    <option value="16:9">16:9 (横屏大平层)</option>
                    <option value="4:3">4:3 (画册图谱)</option>
                    <option value="1:1">1:1 (正方特写)</option>
                  </select>
                </div>
              </div>

              {/* Seed 控制 */}
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="seed-toggle"
                    checked={useRandomSeed}
                    onChange={(e) => setUseRandomSeed(e.target.checked)}
                    className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="seed-toggle" className="text-stone-600">
                    随机种子 (Random Seed)
                  </label>
                </div>

                {!useRandomSeed && (
                  <input
                    type="number"
                    value={customSeed}
                    onChange={(e) => setCustomSeed(parseInt(e.target.value) || 0)}
                    className="w-24 bg-white border border-stone-300 rounded px-1.5 py-0.5 text-[11px] font-mono text-stone-800 text-right"
                  />
                )}
              </div>
            </div>

            {/* 2. 镜头 Camera DNA 参数编辑 */}
            <div className="space-y-3 p-3 bg-white rounded-xl border border-stone-200 shadow-2xs">
              <div className="font-bold text-stone-800 text-xs flex items-center justify-between">
                <span>2. 摄影机参数 (Camera DNA)</span>
                <span className="text-[10px] font-mono text-amber-800 font-bold">
                  {activeShot.templateCode}
                </span>
              </div>

              {/* 焦段 Lens 滑块 */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-600 font-medium">焦段 (Lens)</span>
                  <span className="font-mono font-bold text-amber-700">{activeShot.camera.lensMm} mm</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={120}
                  step={1}
                  value={activeShot.camera.lensMm}
                  onChange={(e) => onUpdateCamera(activeShot.id, { lensMm: parseInt(e.target.value) })}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[9px] text-stone-400 font-mono">
                  <span>18mm 超广角</span>
                  <span>40mm 黄金人眼</span>
                  <span>120mm 微距</span>
                </div>
              </div>

              {/* 机位高度 Height 滑块 */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-600 font-medium">机位高度 (Height)</span>
                  <span className="font-mono font-bold text-amber-700">{activeShot.camera.heightCm} cm</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={200}
                  step={5}
                  value={activeShot.camera.heightCm}
                  onChange={(e) => onUpdateCamera(activeShot.id, { heightCm: parseInt(e.target.value) })}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[9px] text-stone-400 font-mono">
                  <span>40cm 低俯</span>
                  <span>130cm 标准坐高</span>
                  <span>200cm 俯瞰</span>
                </div>
              </div>

              {/* Camera Yaw 水平偏角 */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-600 font-medium">水平旋转 (Camera Yaw)</span>
                  <span className="font-mono font-bold text-amber-700">{activeShot.camera.yawDeg}°</span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={activeShot.camera.yawDeg}
                  onChange={(e) => onUpdateCamera(activeShot.id, { yawDeg: parseInt(e.target.value) })}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[9px] text-stone-400 font-mono">
                  <span>-180°</span>
                  <span>0° 正面</span>
                  <span>+42° 黄金45°</span>
                  <span>+180°</span>
                </div>
              </div>

              {/* Camera Pitch 俯仰角 */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-600 font-medium">俯仰视角 (Camera Pitch)</span>
                  <span className="font-mono font-bold text-amber-700">{activeShot.camera.pitchDeg}°</span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={activeShot.camera.pitchDeg}
                  onChange={(e) => onUpdateCamera(activeShot.id, { pitchDeg: parseInt(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              {/* 对焦目标与构图景别 */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500 font-medium">Focus Target</label>
                  <select
                    value={activeShot.camera.target?.id || 'primary_sofa'}
                    onChange={(e) =>
                      onUpdateCamera(activeShot.id, {
                        target: { type: 'product', id: e.target.value }
                      })
                    }
                    className="w-full bg-[#FAF8F5] border border-stone-300 rounded px-2 py-1 text-xs text-stone-800"
                  >
                    <option value="primary_sofa">三人位主沙发中心</option>
                    <option value="leather_texture">头层牛皮拉扣微距</option>
                    <option value="footrest_mechanics">电动脚踏骨架</option>
                    <option value="coffee_table">巴西潘多拉奢石茶几</option>
                    <option value="overall_living">客餐厅整体全景</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500 font-medium">Framing 景别</label>
                  <select
                    value={activeShot.camera.framing}
                    onChange={(e) =>
                      onUpdateCamera(activeShot.id, {
                        framing: e.target.value as any
                      })
                    }
                    className="w-full bg-[#FAF8F5] border border-stone-300 rounded px-2 py-1 text-xs text-stone-800"
                  >
                    <option value="wide">wide (空间全景)</option>
                    <option value="product">product (产品聚焦)</option>
                    <option value="detail">detail (材质特写)</option>
                    <option value="lifestyle">lifestyle (人景互动)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 3. 必须包含 (Must Include) 与 禁止内容 (Do Not) */}
            <div className="space-y-2 p-3 bg-[#FAF8F5] rounded-xl border border-stone-200">
              <div className="font-bold text-stone-800 text-xs">3. 必须包含 / 禁止内容 (Must / Do Not)</div>

              <div className="space-y-1">
                <span className="text-[10px] text-emerald-800 font-semibold">必须包含 (Must Include):</span>
                <div className="flex flex-wrap gap-1">
                  {mustIncludes.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded text-[10px] flex items-center gap-1"
                    >
                      <span>{tag}</span>
                      <X
                        className="w-2.5 h-2.5 cursor-pointer hover:text-red-500"
                        onClick={() => setMustIncludes(mustIncludes.filter((t) => t !== tag))}
                      />
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="+ 回车新增必须包含标签"
                  value={newIncludeTag}
                  onChange={(e) => setNewIncludeTag(e.target.value)}
                  onKeyDown={handleAddInclude}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-[11px] placeholder:text-stone-400 mt-1"
                />
              </div>

              <div className="space-y-1 pt-1">
                <span className="text-[10px] text-rose-800 font-semibold">禁止内容 (Do Not Include):</span>
                <div className="flex flex-wrap gap-1">
                  {mustNotIncludes.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-rose-50 text-rose-900 border border-rose-200 rounded text-[10px] flex items-center gap-1"
                    >
                      <span>{tag}</span>
                      <X
                        className="w-2.5 h-2.5 cursor-pointer hover:text-red-500"
                        onClick={() => setMustNotIncludes(mustNotIncludes.filter((t) => t !== tag))}
                      />
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="+ 回车新增禁止标签"
                  value={newExcludeTag}
                  onChange={(e) => setNewExcludeTag(e.target.value)}
                  onKeyDown={handleAddExclude}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-[11px] placeholder:text-stone-400 mt-1"
                />
              </div>
            </div>

            {/* 4. 控制锁定 (Locks) & 不变量约束 */}
            <div className="space-y-2 p-3 bg-white rounded-xl border border-stone-200">
              <div className="font-bold text-stone-800 text-xs flex items-center justify-between">
                <span>4. 空间拓扑与控制锁定 (Invariance Locks)</span>
                <Lock className="w-3.5 h-3.5 text-amber-600" />
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {[
                  { key: 'productIdentity', label: '产品一致性锁定' },
                  { key: 'placement', label: '家具物理坐标零位移' },
                  { key: 'architecture', label: '建筑硬装结构锁定' },
                  { key: 'style', label: '设计风格基调锁定' },
                  { key: 'material', label: '材质微观物理锁定' },
                  { key: 'lighting', label: '全局采光色温锁定' },
                  { key: 'cameraDecoupled', label: '摄影机独立运动' },
                  { key: 'humanPass', label: '无人物干扰纯净模式' }
                ].map(({ key, label }) => {
                  const isLocked = (invarianceLocks as any)[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setInvarianceLocks((prev) => ({
                          ...prev,
                          [key]: !(prev as any)[key]
                        }))
                      }
                      className={`p-1.5 rounded border text-left flex items-center justify-between transition ${
                        isLocked
                          ? 'bg-amber-50 text-amber-900 border-amber-300 font-medium'
                          : 'bg-stone-50 text-stone-400 border-stone-200'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      {isLocked ? <Lock className="w-2.5 h-2.5 shrink-0" /> : <Unlock className="w-2.5 h-2.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* 警示条 */}
              <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 font-bold text-[10px] flex items-center gap-1.5 leading-tight">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>KEEP FURNITURE FIXED / CHANGE CAMERA ONLY (锁定家具摆位，只移动摄影机)</span>
              </div>
            </div>

            {/* 5. 提示词解析 (Prompt Compiler Snapshot) 折叠面板 */}
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setIsPromptOpen(!isPromptOpen)}
                className="w-full p-2.5 bg-[#FAF8F5] flex items-center justify-between font-bold text-stone-800 text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-stone-500" />
                  <span>提示词编译器解析 (Prompt Snapshot)</span>
                </span>
                {isPromptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {isPromptOpen && (
                <div className="p-3 text-[10px] space-y-2 font-mono bg-stone-900 text-stone-200 overflow-x-auto">
                  <div>
                    <span className="text-amber-400 font-bold">POSITIVE PROMPT:</span>
                    <p className="mt-0.5 leading-relaxed text-stone-300">{compiledPrompt.positivePrompt}</p>
                  </div>
                  <div className="pt-2 border-t border-stone-800">
                    <span className="text-rose-400 font-bold">NEGATIVE PROMPT:</span>
                    <p className="mt-0.5 leading-relaxed text-stone-400">{compiledPrompt.negativePrompt}</p>
                  </div>
                </div>
              )}
            </div>

            {/* 6. 版本记录 (Revision Graph History) 折叠面板 */}
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="w-full p-2.5 bg-[#FAF8F5] flex items-center justify-between font-bold text-stone-800 text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-stone-500" />
                  <span>修订版本图谱 ({activeShot.revisions.length} Revisions)</span>
                </span>
                {isHistoryOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {isHistoryOpen && (
                <div className="p-3 space-y-2 text-[11px] bg-white">
                  {activeShot.revisions.length === 0 ? (
                    <p className="text-stone-400 text-center py-2 text-[10px]">尚未生成任何版本快照</p>
                  ) : (
                    activeShot.revisions.map((rev) => (
                      <div
                        key={rev.id}
                        className={`p-2 rounded-lg border text-left space-y-1 transition ${
                          rev.id === activeShot.currentRevisionId
                            ? 'bg-amber-50/70 border-amber-400'
                            : 'bg-[#FAF8F5] border-stone-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold text-stone-800">Rev {rev.revisionNumber}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-stone-200 text-stone-700">
                            {rev.provenance}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-stone-500">
                          <span>综合评分: {rev.score?.overall || 0}分</span>
                          <span className="text-[9px]">{new Date(rev.createdAt).toLocaleTimeString()}</span>
                        </div>

                        {rev.id !== activeShot.currentRevisionId && (
                          <button
                            onClick={() => onRollbackRevision(activeShot.id, rev.id)}
                            className="text-[10px] text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 mt-1"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>回滚至此版本</span>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 底部吸底操作按钮区 */}
          <div className="p-3.5 border-t border-[#EBE7E0] bg-[#FAF8F5] space-y-2 shrink-0">
            <button
              onClick={handleGenerate}
              disabled={!isSceneMasterLocked || isJobRunning}
              className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-amber-300 font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2 active:scale-98"
            >
              <Camera className="w-4 h-4 text-amber-400" />
              <span>{isJobRunning ? '正在执行真实渲染...' : `生成当前镜头 (${activeShot.templateCode})`}</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleGenerate}
                disabled={!isSceneMasterLocked || isJobRunning}
                className="py-1.5 px-2 bg-white hover:bg-stone-50 border border-stone-300 disabled:opacity-40 rounded-lg text-[11px] font-medium text-stone-700 flex items-center justify-center gap-1"
              >
                <Layers className="w-3 h-3" />
                <span>生成 4 个候选</span>
              </button>

              <button
                onClick={handleGenerate}
                disabled={!isSceneMasterLocked || !currentRevision?.imageUrl || isJobRunning}
                className="py-1.5 px-2 bg-white hover:bg-stone-50 border border-stone-300 disabled:opacity-40 rounded-lg text-[11px] font-medium text-stone-700 flex items-center justify-center gap-1"
              >
                <RotateCw className="w-3 h-3" />
                <span>基于当前图修改</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ================= 辅助模态框 (参考图 / 平面布局 / Camera DNA / 对比) ================= */}
      {modalView !== 'none' && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-[#FAF8F5]">
              <div className="font-bold text-stone-800 text-sm flex items-center gap-2">
                {modalView === 'ref' && <span>产品参考图库 (Product References)</span>}
                {modalView === 'blueprint' && <span>平面布局与家具坐标 (Floorplan Blueprint)</span>}
                {modalView === 'cameraDna' && <span>镜头空间摄影机几何参数 (Camera DNA Spec)</span>}
                {modalView === 'compare' && <span>与 A00 空间母版基准对比 (Side-by-Side Compare)</span>}
                {modalView === 'fullscreen' && <span>全屏高保真预览 ({activeShot.templateCode})</span>}
              </div>
              <button
                onClick={() => setModalView('none')}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-xs">
              {modalView === 'ref' && (
                <div className="space-y-4">
                  <div className="font-semibold text-stone-700">敏华主力产品资产参考：{products[0]?.name}</div>
                  <div className="grid grid-cols-3 gap-3">
                    {products[0]?.referenceImages?.map((ref) => (
                      <div key={ref.id} className="rounded-xl border border-stone-200 overflow-hidden bg-stone-50">
                        <img
                          src={ref.publicUrl}
                          alt={ref.type}
                          className="w-full h-32 object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="p-2 text-[10px] font-mono text-center text-stone-600 bg-white">
                          视角: {ref.type}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalView === 'blueprint' && (
                <div className="space-y-3">
                  <div className="font-semibold text-stone-700">空间户型：{selectedSpace?.name} ({selectedSpace?.code})</div>
                  <div className="p-4 bg-stone-100 rounded-xl border border-stone-200 font-mono text-[11px] space-y-1">
                    {blueprint?.items?.map((item) => (
                      <div key={item.assetId} className="flex justify-between py-1 border-b border-stone-200">
                        <span className="font-bold text-stone-800">{item.assetName} ({item.role})</span>
                        <span className="text-stone-500">
                          Zone: {item.zoneId} · X:{item.x.toFixed(2)} · Y:{item.y.toFixed(2)} · {item.rotationDeg}°
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalView === 'cameraDna' && (
                <div className="space-y-3 font-mono">
                  <div className="p-4 bg-stone-900 text-stone-200 rounded-xl space-y-2 text-xs">
                    <div>LENS: {activeShot.camera.lensMm} mm (Prime Architectural)</div>
                    <div>HEIGHT: {activeShot.camera.heightCm} cm above floor level</div>
                    <div>YAW: {activeShot.camera.yawDeg} degrees rotation</div>
                    <div>PITCH: {activeShot.camera.pitchDeg} degrees tilt</div>
                    <div>ROLL: {activeShot.camera.rollDeg || 0} degrees horizon level</div>
                    <div>FRAMING: {activeShot.camera.framing} composition</div>
                    <div>FOCUS TARGET: {activeShot.camera.target?.id || 'primary_sofa'}</div>
                  </div>
                </div>
              )}

              {modalView === 'compare' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="font-bold text-stone-800">A00 空间母版 (Scene Master)</span>
                    <div className="aspect-[3/4] rounded-xl border border-stone-300 overflow-hidden bg-stone-100">
                      {sceneMaster?.imageUrl ? (
                        <img
                          src={sceneMaster.imageUrl}
                          alt="Scene Master"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-stone-400">母版未生成</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="font-bold text-stone-800">{activeShot.templateCode} 当前镜头</span>
                    <div className="aspect-[3/4] rounded-xl border border-stone-300 overflow-hidden bg-stone-100">
                      {currentRevision?.imageUrl ? (
                        <img
                          src={currentRevision.imageUrl}
                          alt="Current Shot"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-stone-400">镜头未生成</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {modalView === 'fullscreen' && (
                <div className="flex items-center justify-center">
                  {currentRevision?.imageUrl ? (
                    <img
                      src={currentRevision.imageUrl}
                      alt={activeShot.name}
                      className="max-h-[70vh] rounded-xl shadow-lg object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="p-12 text-stone-400">当前镜头尚未生成资产</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
