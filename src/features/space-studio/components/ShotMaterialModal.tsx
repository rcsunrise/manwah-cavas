import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Images, Loader2, Trash2, Upload, X } from 'lucide-react';
import { ShotInstance } from '../../../types/spaceStudio';
import { ShotMaterialSlot, buildShotMaterialSlots, pickEmptySlotsForFiles, uploadShotMaterial } from '../engine/shotMaterialSlots';

interface Props {
  open: boolean;
  projectId: string;
  shots: ShotInstance[];
  isLight: boolean;
  onClose: () => void;
  onAssign: (shotIds: string[], imageUrl: string | null) => void;
}

const isImage = (file: File) => file.type.startsWith('image/');

export const ShotMaterialModal: React.FC<Props> = ({ open, projectId, shots, isLight, onClose, onAssign }) => {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const batchInputRef = useRef<HTMLInputElement>(null);
  const slotInputRef = useRef<HTMLInputElement>(null);
  const targetSlotRef = useRef<ShotMaterialSlot | null>(null);

  if (!open || typeof document === 'undefined') return null;
  const slots = buildShotMaterialSlots(shots);
  const filled = slots.filter((s) => s.image).length;

  const assignFile = async (slot: ShotMaterialSlot, file: File) => {
    setUploading((prev) => ({ ...prev, [slot.key]: true }));
    try {
      onAssign(slot.shotIds, await uploadShotMaterial(projectId, slot.key, file));
    } catch (err: any) {
      setNotice(`${slot.label}：${err?.message || '上传失败'}`);
    } finally {
      setUploading((prev) => ({ ...prev, [slot.key]: false }));
    }
  };

  const assignBatch = async (files: File[]) => {
    const images = files.filter(isImage);
    const targets = pickEmptySlotsForFiles(slots, images.length);
    setNotice(
      images.length > targets.length
        ? `空坑位只剩 ${targets.length} 个，已按顺序填入前 ${targets.length} 张，其余 ${images.length - targets.length} 张未使用。`
        : `已按顺序填入 ${targets.length} 个坑位，可拖动图片到具体坑位替换。`
    );
    await Promise.all(targets.map((slot, i) => assignFile(slot, images[i])));
  };

  const muted = isLight ? 'text-stone-500' : 'text-stone-400';
  const card = isLight ? 'bg-[#FAF8F5] border-stone-200' : 'bg-stone-950/60 border-stone-800';

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="镜头素材录入"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[880px] max-h-[calc(100vh-32px)] flex flex-col rounded-2xl border shadow-2xl ${
          isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-[#181a24] border-white/15 text-neutral-200'
        }`}
      >
        <div className={`flex items-center gap-2 px-4 py-3 border-b ${isLight ? 'border-stone-100' : 'border-white/10'}`}>
          <Images className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-bold">镜头素材录入</span>
          <span className={`text-xs font-mono ${muted}`}>{filled}/{slots.length}</span>
          <button
            type="button"
            onClick={() => batchInputRef.current?.click()}
            className="ml-auto px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" /> 批量选择图片
          </button>
          <button type="button" onClick={onClose} aria-label="关闭" className={`p-1 rounded cursor-pointer ${isLight ? 'hover:bg-stone-100' : 'hover:bg-white/10'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`px-4 pt-3 text-[12px] leading-relaxed ${muted}`}>
          每个镜头放一张实拍素材，A00 母版与 A01 空间主大场景共用一张。生成时自动用对应素材作为底图；录入素材后，「一键生成全部」只生成有素材的镜头。
          {notice && <div className="mt-1 text-amber-700">{notice}</div>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {slots.map((slot) => (
            <div
              key={slot.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragKey !== slot.key) setDragKey(slot.key);
              }}
              onDragLeave={() => setDragKey((k) => (k === slot.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setDragKey(null);
                const file = Array.from(e.dataTransfer.files).find(isImage);
                if (file) void assignFile(slot, file);
              }}
              className={`rounded-xl border p-2 flex flex-col gap-1.5 ${dragKey === slot.key ? 'border-amber-500 ring-2 ring-amber-400' : card}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-mono font-bold text-amber-600 shrink-0">{slot.label}</span>
                <span className="text-[11px] truncate" title={slot.title}>{slot.title}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  targetSlotRef.current = slot;
                  slotInputRef.current?.click();
                }}
                className={`relative aspect-[4/3] rounded-lg overflow-hidden border border-dashed flex items-center justify-center cursor-pointer ${
                  isLight ? 'border-stone-300 bg-white hover:bg-amber-50' : 'border-stone-700 bg-black/30 hover:bg-stone-800'
                }`}
                title={slot.image ? '点击或拖入新图片替换' : '点击或拖入图片'}
              >
                {slot.image ? (
                  <img src={slot.image} alt={`${slot.label} 素材`} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <span className={`text-[11px] flex flex-col items-center gap-1 ${muted}`}>
                    <Upload className="w-4 h-4" /> 点击或拖入
                  </span>
                )}
                {uploading[slot.key] && (
                  <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </span>
                )}
              </button>
              {slot.image && (
                <button
                  type="button"
                  onClick={() => onAssign(slot.shotIds, null)}
                  className={`self-end text-[10px] flex items-center gap-0.5 cursor-pointer hover:text-rose-600 ${muted}`}
                >
                  <Trash2 className="w-3 h-3" /> 清除
                </button>
              )}
            </div>
          ))}
        </div>

        <input
          ref={batchInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void assignBatch(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        <input
          ref={slotInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && targetSlotRef.current) void assignFile(targetSlotRef.current, file);
            e.target.value = '';
          }}
        />
      </div>
    </div>,
    document.body
  );
};
