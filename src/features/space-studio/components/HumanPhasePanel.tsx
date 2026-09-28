// src/features/space-studio/components/HumanPhasePanel.tsx
// MANWAH Space Studio｜HUMAN 模特、家庭预设、Pose与头等舱脚托装配面板 V5.1
// 强制纪律：
// 1. Keep Furniture Fixed (家具绝不变形、绝对零平移漂移)；
// 2. 机械互锁：电动功能脚托状态与姿态强一致性（深躺必须有展开脚托支撑）；
// 3. 家庭组合一键编组（单人/新婚夫妇/三口之家/三代同堂）；
// 4. 每个场景分组专属提示词录入与微调；
// 5. 支持上传自定义模特资产并加入项目模特库；
// 6. 实时人体工程冲突与穿模检查预警；
// 7. 生成独立的 Human-only Revision 分支。

import React, { useState, useRef } from 'react';
import {
  HumanAsset,
  PosePreset,
  FamilyPreset,
  SeatAssignment,
  ShotInstance,
  FunctionSeatState,
  FootrestMechanicalState,
  HumanErgonomicsReport
} from '../../../types/spaceStudio';
import {
  STANDARD_HUMAN_ASSETS,
  STANDARD_POSE_PRESETS,
  STANDARD_FAMILY_PRESETS,
  FOOTREST_STATE_DESCRIPTIONS
} from '../data/humanPresets';
import { HumanErgonomicsEngine } from '../engine/humanErgonomicsEngine';
import {
  Users,
  Armchair,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sliders,
  HeartHandshake,
  Layers,
  Activity,
  UploadCloud,
  Plus,
  Trash2,
  Edit3,
  Check,
  FileText,
  Image as ImageIcon
} from 'lucide-react';

export interface CustomHumanAssetItem extends Omit<HumanAsset, 'role'> {
  role: HumanAsset['role'] | string;
  imageUrl?: string;
  isCustom?: boolean;
  notes?: string;
}

interface HumanPhasePanelProps {
  activeShot: ShotInstance;
  onApplyHumanPass: (
    assignments: SeatAssignment[],
    familyPresetId?: string,
    scenePrompt?: string,
    customAssets?: CustomHumanAssetItem[]
  ) => void;
  onApproveCurrentShot?: () => void;
  isProcessing?: boolean;
}

// 针对各场景分组的默认高水准提示词
const DEFAULT_SCENE_PROMPTS: Record<string, string> = {
  'fam-single-pro':
    '精英居者身着燕麦色高领羊绒衫，闭目微仰深躺于展开的头等舱功能位中，电动脚托升至零重力舒展，手臂自然搭在宽厚云感扶手，午后侧逆光映衬真皮纹理，神态极度放松惬意。',
  'fam-couple-leisure':
    '当代年轻夫妇在客厅沙发上自然相伴，男士身着深灰圆领衫惬意阅读精装建筑画册，女士身着浅米色针织长裙轻依身侧品尝热茶，两人眼神温和，居家氛围亲密而高级。',
  'fam-trio-warmth':
    '年轻父母与5岁女孩在三人位功能沙发上温馨互动，父亲微调脚托陪伴孩子翻看童话立体绘本，母亲笑容自然温柔，一家人沉浸在明媚现代的客厅晨光中。',
  'fam-multi-gen':
    '三代同堂共享天伦，长辈尊享单人功能沙发安详闭目小憩，年轻父母与孩子在三人位主沙发上温馨交谈，多代人空间就座层次分明，呈现尊贵和睦的中国家庭客厅。'
};

export const HumanPhasePanel: React.FC<HumanPhasePanelProps> = ({
  activeShot,
  onApplyHumanPass,
  onApproveCurrentShot,
  isProcessing = false
}) => {
  const [selectedFamily, setSelectedFamily] = useState<FamilyPreset | null>(STANDARD_FAMILY_PRESETS[1]);
  const [selectedHuman, setSelectedHuman] = useState<CustomHumanAssetItem>(STANDARD_HUMAN_ASSETS[0]);
  const [selectedPose, setSelectedPose] = useState<PosePreset>(STANDARD_POSE_PRESETS[1]);
  const [selectedSeat, setSelectedSeat] = useState<string>('sofa_3s.left');
  const [functionState, setFunctionState] = useState<FunctionSeatState>('recline');
  const [footrestState, setFootrestState] = useState<FootrestMechanicalState>('fully_extended');

  // 自定义模特资产库
  const [customHumans, setCustomHumans] = useState<CustomHumanAssetItem[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadName, setUploadName] = useState<string>('');
  const [uploadRole, setUploadRole] = useState<string>('都会高管精英');
  const [uploadAge, setUploadAge] = useState<string>('28-32');
  const [uploadHeight, setUploadHeight] = useState<number>(172);
  const [uploadWardrobe, setUploadWardrobe] = useState<string>('米白羊绒衫配休闲直筒裤');
  const [uploadImageBase64, setUploadImageBase64] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 每个场景分组的提示词录入状态
  const [scenePrompts, setScenePrompts] = useState<Record<string, string>>(DEFAULT_SCENE_PROMPTS);

  const [activeAssignments, setActiveAssignments] = useState<SeatAssignment[]>(
    STANDARD_FAMILY_PRESETS[1].defaultAssignments
  );

  // 综合模特资产列表（内置 5 款 + 用户上传的自定义模特）
  const allHumanAssets: CustomHumanAssetItem[] = [...customHumans, ...STANDARD_HUMAN_ASSETS];

  // 实时人体工程检查
  const ergonomicsReport: HumanErgonomicsReport = HumanErgonomicsEngine.evaluate({
    assignments: activeAssignments
  });

  // 严格 Gate 门禁校验：Shot 未通过，禁止进入正式 Human Pass
  const hasPassedRevision =
    activeShot.status === 'passed' ||
    activeShot.revisions?.some((r) => r.status === 'approved' && r.validationReport?.pass);

  // 一键应用家庭预设
  const handleSelectFamilyPreset = (preset: FamilyPreset) => {
    setSelectedFamily(preset);
    setActiveAssignments(preset.defaultAssignments);

    // 默认回选该预设的第一位模特
    const firstAss = preset.defaultAssignments[0];
    if (firstAss) {
      const matchHuman = allHumanAssets.find((h) => h.id === firstAss.humanAssetId);
      if (matchHuman) setSelectedHuman(matchHuman);

      const matchPose = STANDARD_POSE_PRESETS.find((p) => p.id === firstAss.poseId);
      if (matchPose) setSelectedPose(matchPose);

      setSelectedSeat(firstAss.seatId);
      setFunctionState(firstAss.functionState);
      setFootrestState(firstAss.footrestState);
    }
  };

  // 添加或覆盖当前座位的模特就座配置
  const handleAddAssignment = () => {
    const newAssignment: SeatAssignment = {
      humanAssetId: selectedHuman.id,
      seatId: selectedSeat,
      poseId: selectedPose.id,
      functionState,
      footrestState
    };

    const existingIndex = activeAssignments.findIndex((a) => a.seatId === selectedSeat);
    if (existingIndex >= 0) {
      const updated = [...activeAssignments];
      updated[existingIndex] = newAssignment;
      setActiveAssignments(updated);
    } else {
      setActiveAssignments([...activeAssignments, newAssignment]);
    }
    setSelectedFamily(null); // 自定义调整后脱离固化预设
  };

  // 清空所有就座模特
  const handleClear = () => {
    setActiveAssignments([]);
    setSelectedFamily(null);
  };

  // 自动修复人体工程与脚托冲突
  const handleAutoFix = () => {
    const fixed = activeAssignments.map((a) => HumanErgonomicsEngine.autoCorrectFootrest(a));
    setActiveAssignments(fixed);
  };

  // 处理模特文件上传
  const handleModelImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setUploadImageBase64(base64);
        if (!uploadName) {
          const defaultTitle = file.name.replace(/\.[^/.]+$/, '');
          setUploadName(defaultTitle || '高定品牌模特');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // 确认保存自定义模特资产
  const handleSaveCustomHuman = () => {
    if (!uploadName.trim()) return;

    const newCustomAsset: CustomHumanAssetItem = {
      id: `custom-human-${Date.now()}`,
      name: uploadName.trim(),
      role: uploadRole || 'individual',
      ageRange: uploadAge,
      heightCm: Number(uploadHeight) || 172,
      wardrobeTags: uploadWardrobe ? uploadWardrobe.split(/[,，、 ]+/).filter(Boolean) : ['高定服饰'],
      imageUrl: uploadImageBase64 || undefined,
      referenceObjectKeys: [],
      isCustom: true
    };

    setCustomHumans((prev) => [newCustomAsset, ...prev]);
    setSelectedHuman(newCustomAsset);
    setIsUploadModalOpen(false);

    // 重置上传表单
    setUploadName('');
    setUploadImageBase64('');
  };

  // 当前场景分组的提示词
  const activeFamilyId = selectedFamily?.id || 'fam-couple-leisure';
  const currentScenePrompt = scenePrompts[activeFamilyId] || DEFAULT_SCENE_PROMPTS[activeFamilyId] || '';

  const handleUpdateScenePrompt = (val: string) => {
    setScenePrompts((prev) => ({
      ...prev,
      [activeFamilyId]: val
    }));
  };

  const handleResetScenePrompt = () => {
    const def = DEFAULT_SCENE_PROMPTS[activeFamilyId] || '';
    handleUpdateScenePrompt(def);
  };

  const handleAppendKeyword = (kw: string) => {
    const current = currentScenePrompt.trim();
    if (!current) {
      handleUpdateScenePrompt(kw);
    } else {
      handleUpdateScenePrompt(`${current}，${kw}`);
    }
  };

  return (
    <div className="space-y-4 p-4 text-xs overflow-y-auto max-h-[calc(100vh-120px)]">
      {/* 顶部说明卡片 */}
      <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-700" />
            <span>03 HUMAN 模特工作台与生活场景</span>
          </span>
          <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-200/70 px-1.5 py-0.5 rounded">
            Keep Furniture Fixed
          </span>
        </div>
        <p className="text-[11px] text-amber-900/80 leading-relaxed">
          基于已过审的空景母版镜位，支持上传品牌模特资产、配置每个场景分组的专属叙事提示词，并严格保持家具空间物理不变量。
        </p>
      </div>

      {/* 1. 家庭预设一键编组 (Family Presets) */}
      <div className="space-y-2">
        <span className="font-semibold text-stone-800 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <HeartHandshake className="w-3.5 h-3.5 text-amber-600" />
            <span>家庭互动场景分组 (Scene Presets)</span>
          </span>
          <span className="text-stone-400 font-mono text-[10px]">
            {STANDARD_FAMILY_PRESETS.length} 组经典生活场景
          </span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          {STANDARD_FAMILY_PRESETS.map((fam) => {
            const isSelected = selectedFamily?.id === fam.id;
            return (
              <button
                key={fam.id}
                onClick={() => handleSelectFamilyPreset(fam)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-amber-50/90 border-amber-500 shadow-xs'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="font-bold text-stone-800 text-[11px] truncate">
                  {fam.name}
                </div>
                <div className="text-[10px] text-stone-500 line-clamp-2 mt-0.5 leading-relaxed">
                  {fam.description}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-amber-700 font-mono font-semibold">
                  <span>{fam.defaultAssignments.length} 位就座</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1.5 当前场景分组的提示词录入与微调 (Scene Group Prompt Directives) */}
      <div className="p-3 bg-[#FAF8F5] rounded-xl border border-stone-200 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-stone-800 text-[11px] flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-600" />
            <span>
              场景分组提示词录入：
              <span className="text-amber-800">
                {selectedFamily?.name.split('·')[0] || '当前场景'}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={handleResetScenePrompt}
            className="text-[10px] text-stone-500 hover:text-amber-700 font-medium flex items-center gap-0.5 transition"
            title="恢复该场景推荐标准提示词"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>重置提示词</span>
          </button>
        </div>

        <textarea
          value={currentScenePrompt}
          onChange={(e) => handleUpdateScenePrompt(e.target.value)}
          rows={3}
          placeholder="录入本场景的人物情绪、互动动作、神态细节、服饰质感或光影氛围..."
          className="w-full p-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 text-[11px] leading-relaxed focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500 shadow-2xs resize-none"
        />

        {/* 快捷动作神态词缀注入 */}
        <div className="space-y-1">
          <span className="text-[10px] text-stone-400 block">快捷动作与光影微调标签：</span>
          <div className="flex flex-wrap gap-1">
            {[
              '微闭双眼沉浸聆听',
              '手捧温热拿铁咖啡',
              '翻阅精装艺术画册',
              '相视微笑自然互动',
              '午后侧逆光微风',
              '晨光穿透落地窗柔和洒落',
              '自然亲昵依靠'
            ].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleAppendKeyword(tag)}
                className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-amber-100 hover:text-amber-900 border border-stone-200 text-stone-600 text-[10px] transition"
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. 模特数字人资产库 (内置 + 用户上传) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-stone-800 flex items-center gap-1.5">
            <span>选择单体模特 (Human Asset)</span>
            <span className="text-stone-400 font-mono text-[10px]">
              ({allHumanAssets.length} 位在库)
            </span>
          </span>

          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="text-[11px] text-amber-800 hover:text-amber-900 font-bold bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded-lg transition flex items-center gap-1 shadow-2xs"
          >
            <Plus className="w-3 h-3 text-amber-700" />
            <span>上传模特资产</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {allHumanAssets.map((human) => {
            const isSelected = selectedHuman.id === human.id;
            return (
              <button
                key={human.id}
                onClick={() => setSelectedHuman(human)}
                className={`p-2 rounded-xl border text-left transition-all flex items-start gap-2 ${
                  isSelected
                    ? 'bg-amber-50/90 border-amber-500 shadow-xs'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                {/* 模特头像或缩略图 */}
                <div className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 shrink-0 overflow-hidden flex items-center justify-center text-stone-400">
                  {human.imageUrl ? (
                    <img
                      src={human.imageUrl}
                      alt={human.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Users className="w-4 h-4 text-stone-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-800 text-[11px] truncate">
                      {human.name.split(' ')[0]}
                    </span>
                    {human.isCustom ? (
                      <span className="text-[9px] px-1 py-0.2 bg-amber-100 rounded text-amber-800 font-mono">
                        自定义
                      </span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.2 bg-stone-100 rounded text-stone-600 font-mono">
                        预置
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-stone-500 truncate mt-0.5">
                    {human.heightCm}cm · {human.ageRange}岁
                  </div>
                  <div className="text-[9px] text-stone-400 truncate">
                    {human.role}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 座位物理锚点选择 */}
      <div className="space-y-2">
        <span className="font-semibold text-stone-800 flex items-center justify-between">
          <span>沙发座位物理锚点 (Seat Anchors)</span>
          <span className="text-stone-400 font-mono text-[10px]">主位带电动机械机构</span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'sofa_3s.left', label: '三人位 · 左侧电动位' },
            { id: 'sofa_3s.center', label: '三人位 · 中间固定位' },
            { id: 'sofa_3s.right', label: '三人位 · 右侧电动位' },
            { id: 'armchair_1s.main', label: '单人头等舱 · 独立躺位' }
          ].map((seat) => (
            <button
              key={seat.id}
              onClick={() => setSelectedSeat(seat.id)}
              className={`p-2 rounded-lg border text-center transition ${
                selectedSeat === seat.id
                  ? 'bg-stone-900 text-white font-bold border-stone-900'
                  : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <div className="text-[10px]">{seat.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 4. 敏华电动功能脚托状态 (Footrest Mechanical State) */}
      <div className="space-y-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
        <div className="flex items-center justify-between">
          <span className="font-bold text-stone-800 text-[11px] flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-amber-600" />
            <span>电动机械机构与功能位开合 (Recliner State)</span>
          </span>
          <span className="text-[10px] font-mono font-bold text-amber-800">
            {FOOTREST_STATE_DESCRIPTIONS[footrestState]?.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setFunctionState('recline');
              setFootrestState('fully_extended');
            }}
            className={`p-2 rounded-lg border text-center transition ${
              functionState === 'recline'
                ? 'bg-amber-100 border-amber-500 font-bold text-amber-900'
                : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
            }`}
          >
            <div className="text-[11px]">全展深躺态 (145°)</div>
            <div className="text-[9px] text-stone-500">脚托升起 · 零重力</div>
          </button>

          <button
            onClick={() => {
              setFunctionState('closed');
              setFootrestState('retracted');
            }}
            className={`p-2 rounded-lg border text-center transition ${
              functionState === 'closed'
                ? 'bg-amber-100 border-amber-500 font-bold text-amber-900'
                : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
            }`}
          >
            <div className="text-[11px]">闭合端坐态 (110°)</div>
            <div className="text-[9px] text-stone-500">脚托收回 · 正常入座</div>
          </button>
        </div>
      </div>

      {/* 5. 模特人体姿态 (Pose Preset) */}
      <div className="space-y-2">
        <span className="font-semibold text-stone-800 flex items-center justify-between">
          <span>选择入座姿态 (Pose Preset)</span>
          <span className="text-stone-400 font-mono text-[10px]">
            {STANDARD_POSE_PRESETS.length} 种人体工学姿势
          </span>
        </span>

        <div className="space-y-1.5">
          {STANDARD_POSE_PRESETS.map((pose) => {
            const isSelected = selectedPose.id === pose.id;
            return (
              <button
                key={pose.id}
                onClick={() => {
                  setSelectedPose(pose);
                  if (pose.seatRule.requiresFootrest && footrestState === 'retracted') {
                    setFootrestState('fully_extended');
                    setFunctionState('recline');
                  }
                }}
                className={`w-full p-2.5 rounded-xl border text-left transition ${
                  isSelected
                    ? 'bg-amber-50 border-amber-500'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800 text-[11px]">{pose.name}</span>
                  {pose.seatRule.requiresFootrest && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-mono">
                      需脚托升起
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-stone-500 truncate mt-0.5">
                  {pose.promptFragment}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 操作按钮：添加/更新当前就座点 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleAddAssignment}
          className="flex-1 py-2 bg-stone-900 hover:bg-stone-800 text-amber-300 font-medium rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
        >
          <Armchair className="w-3.5 h-3.5" />
          <span>配置该座位模特姿态</span>
        </button>

        <button
          onClick={handleClear}
          className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-600 font-medium rounded-xl text-xs transition"
          title="清空已选模特"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 6. 人体工程与物理冲突检查器 (Ergonomics Report) */}
      <div
        className={`p-3 rounded-xl border space-y-2 transition ${
          ergonomicsReport.passed
            ? 'bg-emerald-50/50 border-emerald-300'
            : 'bg-rose-50/60 border-rose-300'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-[11px] flex items-center gap-1.5 text-stone-800">
            <Activity
              className={`w-3.5 h-3.5 ${
                ergonomicsReport.passed ? 'text-emerald-600' : 'text-rose-600'
              }`}
            />
            <span>人体工程与穿模检查 ({ergonomicsReport.score}分)</span>
          </span>
          <span
            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
              ergonomicsReport.passed
                ? 'bg-emerald-200/70 text-emerald-900'
                : 'bg-rose-200/70 text-rose-900'
            }`}
          >
            {ergonomicsReport.passed ? 'CHECK PASS' : 'CONFLICT DETECTED'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
          <div className="bg-white/80 p-1.5 rounded border border-stone-200">
            <span className="text-stone-400 block text-[9px]">臀部座垫接触</span>
            <span className="font-bold text-stone-800">
              {Math.round(ergonomicsReport.hipsContactRatio * 100)}%
            </span>
          </div>
          <div className="bg-white/80 p-1.5 rounded border border-stone-200">
            <span className="text-stone-400 block text-[9px]">靠背贴合分</span>
            <span className="font-bold text-stone-800">
              {ergonomicsReport.backSupportScore}
            </span>
          </div>
          <div className="bg-white/80 p-1.5 rounded border border-stone-200">
            <span className="text-stone-400 block text-[9px]">脚托承托吻合</span>
            <span className="font-bold text-stone-800">
              {ergonomicsReport.footrestAlignmentScore}
            </span>
          </div>
        </div>

        {/* 告警列表 */}
        {ergonomicsReport.issues.length > 0 && (
          <div className="space-y-1 pt-1">
            {ergonomicsReport.issues.map((issue, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 text-[10px] text-rose-800 bg-white/90 p-1.5 rounded border border-rose-200"
              >
                <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-tight">{issue.message}</div>
              </div>
            ))}

            <button
              onClick={handleAutoFix}
              className="w-full mt-1 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded text-[10px] transition"
            >
              一键自动调和脚托与姿态机械互锁
            </button>
          </div>
        )}
      </div>

      {/* 7. 当前就座装配清单与生成 Human-only Revision */}
      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-stone-700">
          <span>当前装配模特清单 ({activeAssignments.length} 位)</span>
          <span className="text-[10px] text-stone-400 font-mono">
            {activeShot.templateCode} 镜头绑定
          </span>
        </div>

        {activeAssignments.map((a, idx) => {
          const h = allHumanAssets.find((m) => m.id === a.humanAssetId);
          const p = STANDARD_POSE_PRESETS.find((pose) => pose.id === a.poseId);
          const f = FOOTREST_STATE_DESCRIPTIONS[a.footrestState || 'retracted'];
          return (
            <div
              key={idx}
              className="flex items-center justify-between bg-white p-2 rounded-lg border border-stone-200 text-[10px]"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-stone-800 font-mono">{a.seatId}</span>
                  <span className="text-amber-800 font-medium">({h?.name.split(' ')[0]})</span>
                </div>
                <div className="text-stone-500">
                  {p?.name.split(' ')[0]} · {f.label}
                </div>
              </div>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
          );
        })}

        {!hasPassedRevision && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-[10px] space-y-1.5">
            <div className="flex items-start gap-1.5 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <span>
                门禁提示：当前镜头尚未完成审核过审。可先一键过审基准镜头，即可立即进行模特与场景植入生成。
              </span>
            </div>
            {onApproveCurrentShot && (
              <button
                type="button"
                onClick={onApproveCurrentShot}
                className="w-full py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md text-[10px] transition shadow-2xs"
              >
                一键过审当前基准镜头 (Unlock Human Pass)
              </button>
            )}
          </div>
        )}

        <button
          onClick={() =>
            onApplyHumanPass(
              activeAssignments,
              selectedFamily?.id,
              currentScenePrompt,
              customHumans
            )
          }
          disabled={isProcessing || !ergonomicsReport.passed || activeAssignments.length === 0}
          className="w-full mt-2 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-medium rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {isProcessing
              ? '正在合成 Human-only Revision...'
              : '生成 Human-only Revision (保持家具不变量)'}
          </span>
        </button>
      </div>

      {/* ================= 上传自定义模特资产浮层弹窗 ================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-stone-200 bg-[#FAF8F5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-800 text-xs">上传自定义模特资产</h3>
                  <p className="text-[10px] text-stone-500">
                    录入品牌自签约模特照片或生活照，就座到沙发指定功能位
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-xs p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {/* 图片上传区域 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-300 hover:border-amber-500 rounded-xl p-4 text-center cursor-pointer transition bg-stone-50 hover:bg-amber-50/40"
              >
                {uploadImageBase64 ? (
                  <div className="flex items-center justify-center gap-3">
                    <img
                      src={uploadImageBase64}
                      alt="Model Preview"
                      className="w-16 h-16 rounded-lg object-cover border border-stone-200 shadow-2xs"
                    />
                    <div className="text-left">
                      <span className="font-bold text-stone-800 text-xs block">照片已加载</span>
                      <span className="text-[10px] text-stone-500">点击可重新选择更换</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <ImageIcon className="w-6 h-6 text-stone-400 mx-auto" />
                    <div className="font-bold text-stone-700 text-xs">点击选择模特照片</div>
                    <div className="text-[10px] text-stone-400">支持单人实拍、白底模特照或居家生活照 (JPG, PNG)</div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleModelImageSelect}
                  className="hidden"
                />
              </div>

              {/* 字段输入 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-stone-700">模特称谓 / 代号 *</label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="如：苏婉 (知性高管)"
                    className="w-full p-2 border border-stone-300 rounded-lg text-xs focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-stone-700">角色定位</label>
                  <input
                    type="text"
                    value={uploadRole}
                    onChange={(e) => setUploadRole(e.target.value)}
                    placeholder="如：女主人、独立精英"
                    className="w-full p-2 border border-stone-300 rounded-lg text-xs focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-stone-700">年龄段</label>
                  <input
                    type="text"
                    value={uploadAge}
                    onChange={(e) => setUploadAge(e.target.value)}
                    placeholder="如：28-32"
                    className="w-full p-2 border border-stone-300 rounded-lg text-xs focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-stone-700">身高 (cm)</label>
                  <input
                    type="number"
                    value={uploadHeight}
                    onChange={(e) => setUploadHeight(Number(e.target.value) || 170)}
                    placeholder="如：172"
                    className="w-full p-2 border border-stone-300 rounded-lg text-xs focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-stone-700">服饰特征与穿搭风格</label>
                <input
                  type="text"
                  value={uploadWardrobe}
                  onChange={(e) => setUploadWardrobe(e.target.value)}
                  placeholder="如：米白高领羊绒衫、知性柔和、浅色直筒裤"
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs focus:border-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-100 text-xs font-medium transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveCustomHuman}
                disabled={!uploadName.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-xs"
              >
                确认录入模特资产
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
