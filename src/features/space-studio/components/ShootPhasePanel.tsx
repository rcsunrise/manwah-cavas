// src/features/space-studio/components/ShootPhasePanel.tsx
// MANWAH Space Studio｜SHOOT 阶段镜头编排与机位面板 V3.0
import React from 'react';
import { ShotInstance, ShotTemplate } from '../../../types/spaceStudio';
import { Camera, Sliders, ShieldCheck, CheckCircle2, RotateCw } from 'lucide-react';

interface ShootPhasePanelProps {
  shots: ShotInstance[];
  activeShot: ShotInstance;
  onSelectShot: (shotId: string) => void;
  onUpdateCamera: (shotId: string, updates: Partial<ShotInstance['camera']>) => void;
  isSceneMasterLocked: boolean;
}

export const ShootPhasePanel: React.FC<ShootPhasePanelProps> = ({
  shots,
  activeShot,
  onSelectShot,
  onUpdateCamera,
  isSceneMasterLocked
}) => {
  return (
    <div className="flex flex-col h-full bg-white border-r border-[#EBE7E0] text-xs select-none">
      {/* 顶部标题区 */}
      <div className="p-4 border-b border-[#EBE7E0] flex items-center justify-between bg-[#FAF8F5]">
        <div>
          <h3 className="font-bold text-stone-800 text-[13px]">
            镜头群组列表 (A01~A08)
          </h3>
          <p className="text-[10px] text-stone-500 mt-0.5">
            继承 A00 母版基准 · 保持家具物理坐标
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 font-mono font-bold">
          {shots.length} SHOTS
        </span>
      </div>

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {shots.map((shot) => {
          const isSelected = shot.id === activeShot.id;
          return (
            <div
              key={shot.id}
              onClick={() => onSelectShot(shot.id)}
              className={`p-3 rounded-xl cursor-pointer transition-all border text-left ${
                isSelected
                  ? 'bg-amber-50/70 border-amber-500 ring-1 ring-amber-400/30 shadow-xs'
                  : 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono font-bold text-amber-900 bg-white px-1.5 py-0.5 rounded border border-stone-200">
                    {shot.templateCode}
                  </span>
                  <span className="font-semibold text-stone-800 text-[12px]">
                    {shot.name}
                  </span>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                    shot.status === 'passed'
                      ? 'bg-emerald-100 text-emerald-800 font-bold'
                      : shot.status === 'generating'
                      ? 'bg-blue-100 text-blue-800 animate-pulse'
                      : 'bg-stone-200/70 text-stone-600'
                  }`}
                >
                  {shot.status === 'passed'
                    ? '已过审 (L2 PASS)'
                    : shot.status === 'generating'
                    ? '渲染中...'
                    : '待渲染'}
                </span>
              </div>

              <div className="text-[10px] text-stone-500 mt-2 flex items-center justify-between font-mono">
                <span>
                  {shot.camera.lensMm}mm · H:{shot.camera.heightCm}cm · Yaw:{shot.camera.yawDeg}°
                </span>
                <span className="text-amber-800 font-semibold">{shot.intent.intentCode}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部母版约束提示条 */}
      <div className="p-3 border-t border-[#EBE7E0] bg-[#FAF8F5] space-y-1.5 shrink-0 text-[11px]">
        <div className="flex items-center gap-1.5 font-semibold text-stone-700">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
          <span>SHOOT 阶段黄金法则</span>
        </div>
        <p className="text-[10px] text-stone-500 leading-relaxed">
          {isSceneMasterLocked
            ? 'A00 空间母版已锁定：所有机位微调仅改变焦距与机位坐标，严禁破坏家具拓扑。'
            : '建议先在 01 BUILD 阶段生成并锁定 A00 空间母版，以确保空间一致性。'}
        </p>
      </div>
    </div>
  );
};
