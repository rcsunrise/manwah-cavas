import React from 'react';
import { Type, AlignLeft, AlignCenter, AlignRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { TextLayer } from '../../types/detailCompositionSchema';

interface TextLayerEditorProps {
  layers: TextLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onChangeLayer: (updatedLayer: TextLayer) => void;
}

export const TextLayerEditor: React.FC<TextLayerEditorProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onChangeLayer
}) => {
  const selectedLayer = layers.find(l => l.id === selectedLayerId) || layers[0];

  if (!selectedLayer) {
    return <div className="p-4 text-xs text-stone-400">暂无选中的文字图层</div>;
  }

  return (
    <div className="p-4 bg-white rounded-2xl border border-[#E5E0D8] space-y-4 text-xs font-sans">
      <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
        <span className="font-bold text-[#2C2A29] flex items-center gap-1.5">
          <Type className="w-4 h-4 text-[#B28C5A]" /> 中文排版图层编辑器 (2100×2800)
        </span>
        <span className="text-[10px] text-stone-400 font-mono">
          Layer: {selectedLayer.copyField.toUpperCase()}
        </span>
      </div>

      {/* Layer selector tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {layers.map(layer => (
          <button
            key={layer.id}
            onClick={() => onSelectLayer(layer.id)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${
              selectedLayer.id === layer.id
                ? 'bg-[#B28C5A] text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {layer.copyField}
          </button>
        ))}
      </div>

      {/* Content Input */}
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-stone-700">文案内容</label>
        <textarea
          rows={3}
          value={selectedLayer.text}
          onChange={(e) => onChangeLayer({ ...selectedLayer, text: e.target.value })}
          className="w-full p-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs font-medium text-[#2C2A29] focus:outline-none focus:ring-1 focus:ring-[#B28C5A]"
        />
      </div>

      {/* Grid Properties */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">字号 (FontSize px)</label>
          <input
            type="number"
            min={16}
            max={200}
            value={selectedLayer.fontSize}
            onChange={(e) => onChangeLayer({ ...selectedLayer, fontSize: parseInt(e.target.value) || 24 })}
            className="w-full p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">字重 (FontWeight)</label>
          <select
            value={selectedLayer.fontWeight}
            onChange={(e) => onChangeLayer({ ...selectedLayer, fontWeight: parseInt(e.target.value) || 400 })}
            className="w-full p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
          >
            <option value={400}>400 Normal</option>
            <option value={600}>600 Medium</option>
            <option value={700}>700 Bold</option>
            <option value={900}>900 Black</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">颜色 (Color)</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={selectedLayer.color}
              onChange={(e) => onChangeLayer({ ...selectedLayer, color: e.target.value })}
              className="w-8 h-8 rounded border-none cursor-pointer"
            />
            <input
              type="text"
              value={selectedLayer.color}
              onChange={(e) => onChangeLayer({ ...selectedLayer, color: e.target.value })}
              className="w-full p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">对齐 (Align)</label>
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              onClick={() => onChangeLayer({ ...selectedLayer, textAlign: "left" })}
              className={`flex-1 p-1 rounded flex justify-center ${selectedLayer.textAlign === "left" ? 'bg-white shadow-xs' : ''}`}
            >
              <AlignLeft className="w-3.5 h-3.5 text-stone-700" />
            </button>
            <button
              onClick={() => onChangeLayer({ ...selectedLayer, textAlign: "center" })}
              className={`flex-1 p-1 rounded flex justify-center ${selectedLayer.textAlign === "center" ? 'bg-white shadow-xs' : ''}`}
            >
              <AlignCenter className="w-3.5 h-3.5 text-stone-700" />
            </button>
            <button
              onClick={() => onChangeLayer({ ...selectedLayer, textAlign: "right" })}
              className={`flex-1 p-1 rounded flex justify-center ${selectedLayer.textAlign === "right" ? 'bg-white shadow-xs' : ''}`}
            >
              <AlignRight className="w-3.5 h-3.5 text-stone-700" />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">X 坐标 (px)</label>
          <input
            type="number"
            min={0}
            max={2100}
            value={selectedLayer.x}
            onChange={(e) => onChangeLayer({ ...selectedLayer, x: parseInt(e.target.value) || 0 })}
            className="w-full p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">Y 坐标 (px)</label>
          <input
            type="number"
            min={0}
            max={14800}
            value={selectedLayer.y}
            onChange={(e) => onChangeLayer({ ...selectedLayer, y: parseInt(e.target.value) || 0 })}
            className="w-full p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">宽度 Width (px)</label>
          <input
            type="number"
            min={50}
            max={2100}
            value={selectedLayer.width}
            onChange={(e) => onChangeLayer({ ...selectedLayer, width: parseInt(e.target.value) || 500 })}
            className="w-full p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-stone-500 font-mono">高度 Height (px)</label>
          <input
            type="number"
            min={30}
            max={5000}
            value={selectedLayer.height}
            onChange={(e) => onChangeLayer({ ...selectedLayer, height: parseInt(e.target.value) || 100 })}
            className="w-full p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
          />
        </div>
      </div>

      {/* Overflow policy */}
      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-[11px]">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <span>中文智能换行 & 溢出自动缩字号 (Shrink) 规则启用中</span>
      </div>
    </div>
  );
};
