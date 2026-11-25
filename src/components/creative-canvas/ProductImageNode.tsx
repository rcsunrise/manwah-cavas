import React, { useRef, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Image as ImageIcon,
  RotateCw,
  CheckCircle2,
  Upload,
  Trash2,
  Maximize2,
  X,
  FileImage,
  Loader2,
  Sparkles,
  Plus,
  Minus
} from 'lucide-react';
import { ProductImageNodeData, DETAIL_SLOTS_MIN, DETAIL_SLOTS_MAX } from '../../types/creativeCanvas';
import { toThumbnailUrl } from '../../utils/thumbnailUrl';
import { POSTER_COPY_LIMITS } from '../../utils/posterCopy';

export const ProductImageNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as ProductImageNodeData;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  // 细节图窗口：鼠标停在哪一格（粘贴进这一格）、拖到哪一格、点了哪一格选文件
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);
  const pickSlotRef = useRef<number>(0);
  const detailEnabled = Boolean(nodeData?.onDetailImageUpload);
  const detailSlots: Array<string | null> = (() => {
    const list = Array.isArray(nodeData?.detailImages) ? nodeData.detailImages.slice(0, DETAIL_SLOTS_MAX) : [];
    while (list.length < DETAIL_SLOTS_MIN) list.push(null);
    return list;
  })();
  const detailFilled = detailSlots.filter(Boolean).length;
  // 上传素材时录入的海报文案：生成 4/3 海报时原样使用，空着的由 AI 写
  const copyAvailable = Boolean(nodeData?.onPosterCopyChange);
  const posterCopy = nodeData?.posterCopy || {};
  const copyFilledCount =
    (posterCopy.title?.trim() ? 1 : 0) +
    (posterCopy.body?.trim() ? 1 : 0) +
    (posterCopy.details || []).filter(d => d && (d.title?.trim() || d.desc?.trim())).length;
  // 文案区默认收起（节点太高会压到下面的节点）；已录入过就展开
  const [copyOpen, setCopyOpen] = useState(copyFilledCount > 0);
  const copyEnabled = copyAvailable && copyOpen;
  const setDetailCopy = (i: number, field: 'title' | 'desc', value: string) => {
    const list = Array.isArray(posterCopy.details) ? [...posterCopy.details] : [];
    while (list.length <= i) list.push(null);
    list[i] = { ...(list[i] || {}), [field]: value };
    nodeData.onPosterCopyChange?.({ details: list });
  };
  const copyInput =
    'nodrag nowheel w-full rounded-md border border-[#E5E0D8] bg-white px-1.5 py-1 text-[10px] text-[#2C2A29] placeholder:text-stone-300 focus:outline-none focus:border-[#B28C5A] resize-none';
  const [isHovered, setIsHovered] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgRetry, setImgRetry] = useState(0);
  // 节点里显示缩略图，缩略图出错退回原图；“放大”弹窗仍用原图
  const [useThumb, setUseThumb] = useState(true);
  // 换图后重新加载；存储网络抖动时自动重试一次，避免一次失败就永远显示成空的上传框
  React.useEffect(() => {
    setImgError(false);
    setImgRetry(0);
    setUseThumb(true);
  }, [nodeData?.imageUrl]);
  const nodeDisplayUrl = nodeData?.imageUrl && useThumb ? toThumbnailUrl(nodeData.imageUrl) : nodeData?.imageUrl;
  const handleImgError = () => {
    if (useThumb && nodeDisplayUrl !== nodeData?.imageUrl) {
      setUseThumb(false);
      return;
    }
    if (imgRetry < 1) {
      setTimeout(() => setImgRetry(r => r + 1), 1500);
    } else {
      setImgError(true);
    }
  };

  const handleUploadFile = (file: File) => {
    if (nodeData?.onUpload) {
      nodeData.onUpload(file);
    } else {
      window.dispatchEvent(new CustomEvent('canvas:upload-product-image', { detail: file }));
    }
  };

  React.useEffect(() => {
    if (!isHovered) return;

    const handlePaste = (e: ClipboardEvent) => {
      // 鼠标停在节点上就归节点：即使光标还留在对话框里（刚发完消息常见），也不让对话框抢走
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (hoverSlot !== null && nodeData?.onDetailImageUpload) {
              nodeData.onDetailImageUpload(hoverSlot, file);
            } else if (nodeData?.imageUrl) {
              // 已有主图：粘贴的图放进对话框当附件，不覆盖
              window.dispatchEvent(new CustomEvent('canvas:chat-attach-image', { detail: file }));
            } else {
              handleUploadFile(file);
            }
            break;
          }
        }
      }
    };

    // 捕获阶段先拿到，对话框输入框自己的粘贴处理就不会再收到这张图
    window.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('paste', handlePaste, true);
    };
  }, [isHovered, nodeData, hoverSlot]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  const dimensionsText = nodeData?.dimensions?.width && nodeData?.dimensions?.height
    ? `${nodeData.dimensions.width}×${nodeData.dimensions.height}`
    : null;

  return (
    <>
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-80 p-4 rounded-2xl bg-white/95 backdrop-blur-md border transition-all shadow-lg ${
          isDragging
            ? 'border-[#B28C5A] ring-4 ring-[#B28C5A]/40 bg-[#F9F5EF]'
            : selected
            ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30 shadow-[#B28C5A]/10'
            : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
        }`}
      >
        <Handle type="target" position={Position.Left} id="target" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#E5E0D8]/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8]/50">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-xs text-[#2C2A29]">产品主图</h3>
              <span className="text-[10px] text-stone-400 block truncate max-w-[130px]">
                {nodeData?.fileName || (nodeData?.imageUrl ? 'product_photo.jpg' : '未上传')}
              </span>
            </div>
          </div>

          {nodeData?.imageUrl ? (
            nodeData.status === 'analyzing' ? (
              <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium border border-amber-200 animate-pulse">
                <Loader2 className="w-3 h-3 text-amber-600 animate-spin" /> DNA分析中
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 已就绪
              </span>
            )
          ) : (
            <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200 font-medium">
              待上传
            </span>
          )}
        </div>

        {/* Image Display or Interactive Dropzone */}
        {nodeData?.imageUrl && !imgError ? (
          <div className="relative w-full h-48 bg-stone-900/5 rounded-xl overflow-hidden border border-[#E5E0D8]/80 group flex items-center justify-center">
            <img
              key={imgRetry}
              src={nodeDisplayUrl}
              alt={nodeData.fileName || 'Product Image'}
              className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-102"
              onError={handleImgError}
            />

            {/* Hover Actions Bar */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="p-2 bg-white/90 hover:bg-white text-stone-800 rounded-xl shadow-lg hover:scale-105 transition-all text-xs font-medium flex items-center gap-1"
                title="放大查看"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#B28C5A]" />
                <span>放大</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded-xl shadow-lg hover:scale-105 transition-all text-xs font-medium flex items-center gap-1"
                title="更换图片"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>更换</span>
              </button>

              {nodeData?.onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    nodeData.onRemove?.();
                  }}
                  className="p-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg hover:scale-105 transition-all text-xs font-medium flex items-center gap-1"
                  title="移除图片"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dimension Badge */}
            {dimensionsText && (
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[9px] font-mono tracking-wide">
                {dimensionsText}
              </div>
            )}
            {nodeData?.fileSize && (
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[9px] font-mono">
                {nodeData.fileSize}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`w-full h-44 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center p-4 text-center group ${
              isDragging
                ? 'border-[#B28C5A] bg-[#F9F5EF]'
                : 'border-[#E5E0D8] hover:border-[#B28C5A] bg-[#FAF8F5] hover:bg-[#F9F5EF]/60'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-[#E5E0D8] text-[#B28C5A] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#2C2A29] mb-1">点击、拖拽或悬停粘贴 (Ctrl+V)</p>
            <p className="text-[10px] text-stone-400">支持鼠标悬停直接粘贴图片或拖放文件 (PNG/JPG/WEBP)</p>
            <div className="mt-2 text-[9px] text-[#B28C5A] font-medium bg-[#B28C5A]/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>上传后自动提取立体 DNA</span>
            </div>
          </div>
        )}

        {/* 主图海报文案：标题 + 正文（第一行副标题，第二行灵感小字），空着由 AI 写 */}
        {copyEnabled && nodeData?.imageUrl && (
          <div className="mt-3 space-y-1" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] font-bold text-[#2C2A29]">
              海报文案 <span className="font-normal text-stone-400">选填，空着由 AI 写</span>
            </div>
            <input
              className={copyInput}
              value={posterCopy.title || ''}
              maxLength={POSTER_COPY_LIMITS.title}
              placeholder={`标题（≤${POSTER_COPY_LIMITS.title} 字，如“曜境”）`}
              onChange={e => nodeData.onPosterCopyChange?.({ title: e.target.value })}
            />
            <textarea
              className={copyInput}
              rows={2}
              value={posterCopy.body || ''}
              placeholder={`正文：第一行副标题（≤${POSTER_COPY_LIMITS.subtitle} 字），第二行灵感小字（≤${POSTER_COPY_LIMITS.inspiration} 字）`}
              onChange={e => nodeData.onPosterCopyChange?.({ body: e.target.value })}
            />
          </div>
        )}

        {/* 细节图窗口：默认 3 格，可增减到 3–6 格；4/3 海报底部细节格按这里的格数和实拍排版 */}
        {detailEnabled && (
          <div className="mt-3">
            <input
              ref={detailInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                // 一次选多张：从点的那一格起依次填（不够就增加格数，最多 6 格）
                const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
                let slot = pickSlotRef.current;
                const total = Math.min(DETAIL_SLOTS_MAX, Math.max(detailSlots.length, slot + files.length));
                if (total > detailSlots.length) nodeData.onDetailSlotsChange?.(total);
                for (const f of files) {
                  if (slot >= DETAIL_SLOTS_MAX) break;
                  nodeData.onDetailImageUpload?.(slot, f);
                  slot += 1;
                }
                e.target.value = '';
              }}
            />
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-[#2C2A29]">
                细节图 <span className="font-normal text-stone-400">{detailFilled}/{detailSlots.length} · 海报底部 {detailSlots.length} 格</span>
              </span>
              <div className="nodrag flex items-center gap-1">
                {copyAvailable && (
                  <button
                    type="button"
                    title="录入海报标题 / 正文，空着的由 AI 写"
                    onClick={(e) => { e.stopPropagation(); setCopyOpen(v => !v); }}
                    className={`h-5 px-1.5 rounded-md border text-[9px] font-bold whitespace-nowrap ${copyOpen ? 'border-[#B28C5A] text-[#8C6F43] bg-[#F9F5EF]' : 'border-[#E5E0D8] text-stone-500 hover:border-[#B28C5A] hover:text-[#B28C5A]'}`}
                  >
                    {copyOpen ? '收起文案' : copyFilledCount ? `文案 ${copyFilledCount}` : '填写文案'}
                  </button>
                )}
                <button
                  type="button"
                  title="减少一格"
                  disabled={detailSlots.length <= DETAIL_SLOTS_MIN}
                  onClick={(e) => { e.stopPropagation(); nodeData.onDetailSlotsChange?.(detailSlots.length - 1); }}
                  className="w-5 h-5 rounded-md border border-[#E5E0D8] text-stone-500 flex items-center justify-center hover:border-[#B28C5A] hover:text-[#B28C5A] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  title="增加一格（最多 6 格）"
                  disabled={detailSlots.length >= DETAIL_SLOTS_MAX}
                  onClick={(e) => { e.stopPropagation(); nodeData.onDetailSlotsChange?.(detailSlots.length + 1); }}
                  className="w-5 h-5 rounded-md border border-[#E5E0D8] text-stone-500 flex items-center justify-center hover:border-[#B28C5A] hover:text-[#B28C5A] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="nodrag grid grid-cols-3 gap-1.5">
              {detailSlots.map((url, i) => (
                <div key={i} className="flex flex-col gap-1">
                <div
                  onMouseEnter={() => setHoverSlot(i)}
                  onMouseLeave={() => setHoverSlot(cur => (cur === i ? null : cur))}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragSlot(i); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragSlot(cur => (cur === i ? null : cur)); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragSlot(null);
                    setIsDragging(false);
                    const file = Array.from(e.dataTransfer.files || []).find(f => f.type.startsWith('image/'));
                    if (file) nodeData.onDetailImageUpload?.(i, file);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    pickSlotRef.current = i;
                    detailInputRef.current?.click();
                  }}
                  title={url ? '点击更换；悬停可粘贴替换' : '点击选择、拖入或悬停粘贴 (Ctrl+V) 细节图'}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border transition-all group/slot ${
                    dragSlot === i
                      ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/40 bg-[#F9F5EF]'
                      : url
                        ? 'border-[#E5E0D8]'
                        : `border-dashed ${hoverSlot === i ? 'border-[#B28C5A] bg-[#F9F5EF]' : 'border-[#E5E0D8] bg-[#FAF8F5]'}`
                  }`}
                >
                  {url ? (
                    <>
                      <img
                        src={url.startsWith('http') ? toThumbnailUrl(url) : url}
                        onError={(e) => { if (e.currentTarget.src !== url) e.currentTarget.src = url; }}
                        alt={`细节 ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {url.startsWith('blob:') && (
                        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-[#B28C5A] animate-spin" />
                        </div>
                      )}
                      <button
                        type="button"
                        title="移除这张细节图"
                        onClick={(e) => { e.stopPropagation(); nodeData.onDetailImageRemove?.(i); }}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                      <span className="absolute bottom-0.5 left-1 text-[8px] font-mono text-white drop-shadow">{i + 1}</span>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-stone-400">
                      <Plus className="w-3.5 h-3.5 mb-0.5" />
                      <span className="text-[9px]">细节 {i + 1}</span>
                    </div>
                  )}
                </div>
                {copyEnabled && (
                  <>
                    <input
                      className={copyInput}
                      value={posterCopy.details?.[i]?.title || ''}
                      maxLength={POSTER_COPY_LIMITS.detailTitle}
                      placeholder="标题"
                      title={`细节 ${i + 1} 标题（≤${POSTER_COPY_LIMITS.detailTitle} 字），空着由 AI 写`}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setDetailCopy(i, 'title', e.target.value)}
                    />
                    <textarea
                      className={copyInput}
                      rows={2}
                      value={posterCopy.details?.[i]?.desc || ''}
                      maxLength={POSTER_COPY_LIMITS.detailDesc}
                      placeholder="正文"
                      title={`细节 ${i + 1} 正文（≤${POSTER_COPY_LIMITS.detailDesc} 字，建议“功能 · 工艺 · 情绪”三个短语），空着由 AI 写`}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setDetailCopy(i, 'desc', e.target.value)}
                    />
                  </>
                )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Info & Actions */}
        <div className="mt-3 pt-2.5 border-t border-[#E5E0D8]/40 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-[10px] text-stone-500">
          <span className="text-stone-400 whitespace-nowrap">
            {nodeData?.uploadedAt ? `上传时间：${nodeData.uploadedAt}` : '支持拖拽/粘贴图片'}
          </span>
          {/* 按钮整颗换行，不在字中间断开（以前节点窄时会挤成“模板海/报”竖排） */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {nodeData?.imageUrl && nodeData?.onTemplatePoster && (
              <button
                type="button"
                disabled={nodeData.templatePosterRunning}
                onClick={(e) => {
                  e.stopPropagation();
                  nodeData.onTemplatePoster?.();
                }}
                title="用这张产品图生成4/3 产品海报（多张产品图可同时生成）"
                className="nodrag flex items-center gap-1 text-white font-bold px-2 py-1 rounded-md bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-60 disabled:cursor-wait transition-all whitespace-nowrap"
              >
                {nodeData.templatePosterRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>{nodeData.templatePosterRunning ? '海报生成中' : '4/3 产品海报'}</span>
              </button>
            )}
            {nodeData?.imageUrl && nodeData?.onFabricPoster && (
              <button
                type="button"
                disabled={nodeData.fabricPosterRunning}
                onClick={(e) => {
                  e.stopPropagation();
                  nodeData.onFabricPoster?.();
                }}
                title="用这张沙发图生成氛围海报：白底沙发 + 抱枕 + 氛围照拼贴 + 圆形细节与面料色卡（出 5~6 张图，扣点）"
                className="nodrag flex items-center gap-1 text-[#8C6F43] font-bold px-2 py-1 rounded-md border border-[#B28C5A]/50 hover:bg-[#FAF6EF] disabled:opacity-60 disabled:cursor-wait transition-all whitespace-nowrap"
              >
                {nodeData.fabricPosterRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>{nodeData.fabricPosterRunning ? '氛围海报生成中' : '氛围海报'}</span>
              </button>
            )}
            {nodeData?.imageUrl && nodeData?.onReanalyze && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  nodeData.onReanalyze?.();
                }}
                className="flex items-center gap-1 text-[#B28C5A] hover:text-[#9E7A4A] font-bold px-2 py-1 rounded-md bg-[#F9F5EF] hover:bg-[#F2EBDC] transition-all whitespace-nowrap"
              >
                <RotateCw className="w-3 h-3" />
                <span>重新分析</span>
              </button>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Right} id="source" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
      </div>

      {/* Lightbox Modal */}
      {showPreviewModal && nodeData?.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-fadeIn">
          <div className="relative max-w-4xl max-h-[90vh] bg-[#2C2622] rounded-3xl overflow-hidden shadow-2xl border border-stone-700 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 text-white">
              <div className="flex items-center gap-2">
                <FileImage className="w-5 h-5 text-[#D4AF37]" />
                <span className="font-serif font-bold text-sm">产品主图大图预览</span>
                {dimensionsText && (
                  <span className="text-xs text-stone-400 bg-stone-800 px-2 py-0.5 rounded-md font-mono">
                    {dimensionsText}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 text-stone-400 hover:text-white rounded-full hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Image Display */}
            <div className="p-6 flex-1 overflow-auto flex items-center justify-center bg-black/40">
              <img
                src={nodeData.imageUrl}
                alt={nodeData.fileName || 'Product Main Photo'}
                className="max-h-[70vh] object-contain rounded-xl shadow-lg border border-stone-800"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
              <span>{nodeData.fileName || 'product_photo.jpg'}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewModal(false);
                    fileInputRef.current?.click();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#B28C5A] text-white font-bold hover:bg-[#9E7A4A] transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>更换主图</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
