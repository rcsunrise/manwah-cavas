import React, { useState } from 'react';
import { Type, Download, Sparkles } from 'lucide-react';

interface PosterTypographyOverlayProps {
  screenTitle: string;
  coreSellingPoint?: string;
  themeTitle?: string;
  sceneIndex: number;
  imageUrl: string;
  defaultVisible?: boolean;
  className?: string;
}

export const PosterTypographyOverlay: React.FC<PosterTypographyOverlayProps> = ({
  screenTitle,
  coreSellingPoint,
  themeTitle,
  sceneIndex,
  imageUrl,
  defaultVisible = false,
  className = ''
}) => {
  // 默认关闭文字图层（灭蝇处理：防止重影与盖图）
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPoster = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExporting || !imageUrl) return;

    try {
      setIsExporting(true);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法初始化 Canvas 绘图上下文');

      canvas.width = img.naturalWidth || 1440;
      canvas.height = img.naturalHeight || 1920;

      const w = canvas.width;
      const h = canvas.height;

      // 1. 绘制底层基础渲染图
      ctx.drawImage(img, 0, 0, w, h);

      // 2. 绘制顶部高奢暗向渐变遮罩 (适度遮罩，避免大面积污染画面)
      const topGradient = ctx.createLinearGradient(0, 0, 0, h * 0.18);
      topGradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
      topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topGradient;
      ctx.fillRect(0, 0, w, h * 0.18);

      // 3. 绘制底部渐变遮罩
      const bottomGradient = ctx.createLinearGradient(0, h * 0.7, 0, h);
      bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, h * 0.7, w, h * 0.3);

      // 4. 顶部 Header 简约文案 (仅保留品牌与 Scene 编号，不重复绘制全名长标题，防止碰撞重影)
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = `bold ${Math.round(w * 0.02)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(`MANWAH DESIGN STUDIO  |  ${themeTitle || '全案企划海报'}`, w * 0.04, h * 0.045);

      // 右上角 Scene 编号标牌
      ctx.fillStyle = '#B28C5A';
      const badgeWidth = w * 0.14;
      const badgeHeight = h * 0.03;
      const badgeX = w * 0.96 - badgeWidth;
      const badgeY = h * 0.028;
      
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, h * 0.008);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.round(w * 0.018)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`SCENE #${sceneIndex}`, badgeX + badgeWidth / 2, badgeY + badgeHeight * 0.7);
      ctx.restore();

      // 5. 底部主文案区排版 (精准展示 screenTitle + coreSellingPoint)
      ctx.save();
      ctx.textAlign = 'left';

      // 卖点 Pill 标签
      ctx.fillStyle = 'rgba(178, 140, 90, 0.85)';
      const tagWidth = w * 0.14;
      const tagHeight = h * 0.026;
      const tagX = w * 0.04;
      const tagY = h * 0.81;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagWidth, tagHeight, h * 0.005);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.round(w * 0.015)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('爆款卖点', tagX + tagWidth / 2, tagY + tagHeight * 0.72);

      // 主标题
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.round(w * 0.036)}px system-ui, -apple-system, sans-serif`;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 12;
      ctx.fillText(screenTitle, w * 0.04, h * 0.88, w * 0.92);

      // 核心卖点详细文案
      if (coreSellingPoint && coreSellingPoint !== screenTitle) {
        ctx.fillStyle = '#E5E0D8';
        ctx.font = `medium ${Math.round(w * 0.022)}px system-ui, -apple-system, sans-serif`;
        ctx.shadowBlur = 6;
        ctx.fillText(`“ ${coreSellingPoint} ”`, w * 0.04, h * 0.925, w * 0.92);
      }

      // 底部英文字样
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = `normal ${Math.round(w * 0.015)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(`PREMIUM CREATIVE PLANNER · HIGH END COMMERCIAL EDITION`, w * 0.04, h * 0.965);

      ctx.restore();

      // 6. 导出并触发文件下载 (使用超清无损 PNG，解决只有 500KB 且字体发虚问题)
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeTitle = (screenTitle || '海报').replace(/[\s/\\?%*:|"<>]/g, '_').slice(0, 20);
      link.download = `MW_海报企划_第${sceneIndex}屏_${safeTitle}_无损超清_${w}x${h}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('导出带字海报失败:', err);
      alert('导出海报失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* 顶部控制栏 (独立绝对定位，右上角精巧按钮，不遮挡画面) */}
      <div className="absolute top-2 right-2 z-30 pointer-events-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsVisible(!isVisible);
          }}
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-md transition-all shadow-xs flex items-center gap-1 border ${
            isVisible
              ? 'bg-[#B28C5A] text-white border-[#B28C5A] hover:bg-[#9E7A4A]'
              : 'bg-black/50 text-white/80 border-white/20 hover:bg-black/80 hover:text-white'
          }`}
          title={isVisible ? '关闭企划排版文字' : '开启企划排版文字'}
        >
          <Type className="w-2.5 h-2.5" />
          <span>{isVisible ? 'T文字:开' : 'T文字:关'}</span>
        </button>

        {isVisible && (
          <button
            type="button"
            onClick={handleDownloadPoster}
            disabled={isExporting}
            className="px-2 py-0.5 bg-black/70 hover:bg-black/90 text-white border border-white/20 rounded-full text-[10px] font-medium backdrop-blur-md transition-all shadow-xs flex items-center gap-1 disabled:opacity-50"
            title="导出/下载带字企划海报"
          >
            <Download className="w-2.5 h-2.5 text-emerald-400" />
            <span>{isExporting ? '导出中...' : '下载海报'}</span>
          </button>
        )}
      </div>

      {/* 极简无重影排版 Overlay 渲染结构 */}
      {isVisible && (
        <div className="w-full h-full flex flex-col justify-between select-none animate-in fade-in duration-200 pointer-events-none overflow-hidden rounded-lg">
          {/* 顶部 Header：仅保留极简品牌名 + Scene 标识，预留右侧按钮边距 */}
          <div className="w-full pt-2.5 pb-3 px-3 flex items-center justify-between bg-gradient-to-b from-black/75 via-black/35 to-transparent">
            <span className="text-[9px] font-bold tracking-widest text-amber-200/90 uppercase font-mono truncate max-w-[50%]">
              {themeTitle || 'MANWAH CREATIVE STUDIO'}
            </span>

            <div className="bg-[#B28C5A] text-white font-mono font-bold text-[8px] px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1 shrink-0 mr-24">
              <Sparkles className="w-2.5 h-2.5 text-amber-200" />
              <span>SCENE #{sceneIndex}</span>
            </div>
          </div>

          {/* 底部文案：唯一集中展示标题与核心卖点，杜绝上下重复堆叠 */}
          <div className="w-full pb-3 pt-5 px-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="bg-amber-400/20 text-amber-200 border border-amber-400/30 text-[8px] px-1 py-0.2 rounded font-bold shrink-0">
                爆款卖点
              </span>
              <span className="text-white font-bold text-xs leading-snug drop-shadow-md line-clamp-1">
                {screenTitle}
              </span>
            </div>

            {coreSellingPoint && coreSellingPoint !== screenTitle && (
              <p className="text-stone-300 text-[10px] leading-tight line-clamp-2 drop-shadow-sm pl-1 font-medium">
                {coreSellingPoint}
              </p>
            )}

            <div className="flex items-center justify-between text-[7px] text-white/50 font-mono pt-1 border-t border-white/10">
              <span>PREMIUM COMMERCIAL EDITION</span>
              <span>100% VISUAL DNA</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

