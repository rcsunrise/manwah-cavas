import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../../src/lib/supabase';
import {
  ScreenCompositionV2,
  ImageLayer,
  TextLayer,
  CompositionAssembleInput,
  TextCopyField
} from '../../src/types/detailCompositionSchema';
import { LayoutManifestService } from './layoutManifestService';
import {
  inMemoryCopySkus,
  inMemoryCopyVersions,
  inMemoryTypographySpecs
} from '../routes/copyRoutes';
import { computeDeterministicAestheticLayout } from './aestheticLayoutService';

// In-memory fallback stores
const memoryCompositions = new Map<string, ScreenCompositionV2>();
const memoryCompositionVersions = new Map<string, ScreenCompositionV2>();

export function getSceneDefaultCopyContent(sceneNumber: number, screenRole?: string): any {
  switch (sceneNumber) {
    case 2:
      return {
        eyebrow: "MANWAH · 空间美学",
        headline: "沉浸式意式客厅全景",
        subheadline: "奢阔格局 · 点亮现代居家艺术",
        body: "通透空间布局与典雅大气质感，融入低调奢华线条，赋予客厅现代诗意与从容氛围。",
        sellingPoints: ["✦ 极简意式优雅轮廓", "✦ 360° 全景沉浸氛围"],
        cta: "全景品鉴 ＞",
        disclaimer: "* 搭配饰品与软装仅供场景参考，以实物为准"
      };
    case 3:
      return {
        eyebrow: "MANWAH · 匠心选材",
        headline: "进口头层全青牛皮",
        subheadline: "温润亲肤 · 奢华触感可见",
        body: "甄选欧洲高海拔生态牧场原皮，仅保留优质头层胚皮，触感细腻温润，历久弥新。",
        sellingPoints: ["✦ 0.9-1.1mm 奢品级胚皮", "✦ 呼吸微孔恒温透气"],
        cta: "触感鉴赏 ＞",
        disclaimer: "* 天然真皮纹理具有独特自然特征，属正常天然皮质表现"
      };
    case 4:
      return {
        eyebrow: "MANWAH · 智能工学",
        headline: "110°-160° 智能电动无级调节",
        subheadline: "零重力悬浮坐感 · 贴合人体生理曲线",
        body: "微电脑精密联动控制，一键随心切换阅读、观影、小憩多维角度，让身心彻底释放压力。",
        sellingPoints: ["✦ 一键零重力悬浮深睡", "✦ 多区科学分散背臀压力"],
        cta: "功能体验 ＞",
        disclaimer: "* 电动调节范围为实验测定值，请按说明书规范操作"
      };
    case 5:
      return {
        eyebrow: "MANWAH · 核心动力",
        headline: "德国进口大扭矩静音双电机",
        subheadline: "丝滑顺畅 · 稳健静音运行",
        body: "航空级合金内部骨架搭载高精度驱动模组，运行噪音低至 42dB，持久强劲平稳顺滑。",
        sellingPoints: ["✦ ≤42dB 静音平稳驱动", "✦ 300kg 超强承重测试合格"],
        cta: "核心解析 ＞",
        disclaimer: "* 噪音与承重数据来自敏华国家级CNAS实验室测试标准"
      };
    case 6:
      return {
        eyebrow: "MANWAH · 舒适支撑",
        headline: "高弹云感乳胶与高密度海绵",
        subheadline: "科学分区分压 · 柔弹包裹深层护脊",
        body: "天然乳胶与东亚高弹海绵黄金配比，坐感丰盈Q弹，持久承托不塌陷，贴合脊椎曲线。",
        sellingPoints: ["✦ 45D+ 高密度记忆回弹海绵", "✦ 7区人体工学护脊承托"],
        cta: "云端试坐 ＞",
        disclaimer: "* 海绵与乳胶厚度配比根据不同批次工学优化可能微调"
      };
    case 7:
      return {
        eyebrow: "MANWAH · 精工细节",
        headline: "意式极简双缝线手工工艺",
        subheadline: "精益求精 · 见证奢品工艺水准",
        body: "德国杜克普专业缝纫设备与多年资深皮艺匠人手工拉线，针脚匀称密实，彰显非凡格调。",
        sellingPoints: ["✦ 精密双轨手工明线", "✦ 防爆边加固内折边工艺"],
        cta: "细节特写 ＞",
        disclaimer: "* 手工工艺细节可能存在细微手工温度差异"
      };
    case 8:
      return {
        eyebrow: "MANWAH · 绿色健康",
        headline: "母婴级环保净味认证",
        subheadline: "严选生态胶水 · 安心守护全家健康",
        body: "全流程通过国际权威环境认证与无害化处理，即装即享无异味，为家人筑起健康防线。",
        sellingPoints: ["✦ 达到并优于国家E0级环保标准", "✦ 0甲醛环保生态水性胶"],
        cta: "环保检测 ＞",
        disclaimer: "* 环保检测报告依据国标 GB18584-2001 检验合格"
      };
    case 9:
      return {
        eyebrow: "MANWAH · 尊享服务",
        headline: "敏华专属专业入户送装",
        subheadline: "全国联保 · 终身电机质保保障",
        body: "覆盖全国的专业售后保障团队，提供预约免费送装入户与终身机架电机维护保障。",
        sellingPoints: ["✦ 免费预约上门送装一体", "✦ 电机机架终身质保保障"],
        cta: "咨询客服 ＞",
        disclaimer: "* 送装服务范围及具体质保细则以官方服务条款为准"
      };
    default:
      return {
        eyebrow: "MANWAH AI STUDIO · 企划自研",
        headline: "敏华意式奢华真皮沙发",
        subheadline: "云端坐感 · 全青皮抱压工程",
        body: "采用头层进口牛皮，搭配高回弹记忆海绵与碳素钢支撑脚，打造极致奢享生活空间。",
        sellingPoints: [
          "✦ 110° 黄金电动人体工学调节",
          "✦ 德国进口大功率静音电机"
        ],
        cta: "立即体验 ＞",
        disclaimer: "* 尺寸数据为人工测量，实际尺寸请以实物为准"
      };
  }
}

export function calculateCompositionChecksum(comp: ScreenCompositionV2): string {
  const payload = {
    screenId: comp.screenId,
    width: comp.width,
    height: comp.height,
    copyVersionId: comp.copyVersionId,
    typographySpecId: comp.typographySpecId,
    baseAssetVersionId: comp.baseAssetVersionId,
    imageLayers: comp.imageLayers,
    textLayers: comp.textLayers
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Creates default Typography Spec slots if no explicit Typography Spec exists
 */
export function buildDefaultTypographySlotsFromCopyContent(c: any): any[] {
  const slots: any[] = [];
  const content = c || {};

  if (content.eyebrow) {
    slots.push({
      slotKey: 'eyebrow',
      semanticRole: 'eyebrow',
      content: String(content.eyebrow),
      enabled: true,
      fontSize: 36,
      fontWeight: 700,
      color: '#B28C5A',
      maxLines: 1,
      overflowPolicy: 'shrink'
    });
  }

  if (content.headline) {
    slots.push({
      slotKey: 'headline',
      semanticRole: 'headline',
      content: String(content.headline),
      enabled: true,
      fontSize: 76,
      fontWeight: 900,
      color: '#2C2A29',
      maxLines: 2,
      overflowPolicy: 'shrink'
    });
  }

  if (content.subheadline) {
    slots.push({
      slotKey: 'subheadline',
      semanticRole: 'subheadline',
      content: String(content.subheadline),
      enabled: true,
      fontSize: 42,
      fontWeight: 700,
      color: '#8C8275',
      maxLines: 2,
      overflowPolicy: 'shrink'
    });
  }

  if (content.body) {
    slots.push({
      slotKey: 'body',
      semanticRole: 'body',
      content: String(content.body),
      enabled: true,
      fontSize: 28,
      fontWeight: 400,
      color: '#666059',
      maxLines: 3,
      overflowPolicy: 'ellipsis'
    });
  }

  const sellingPoints = Array.isArray(content.sellingPoints) ? content.sellingPoints : [];
  sellingPoints.forEach((sp: string, idx: number) => {
    slots.push({
      slotKey: `selling_point_${idx}`,
      semanticRole: 'selling_point',
      content: String(sp || ''),
      enabled: true,
      fontSize: 34,
      fontWeight: 600,
      color: '#4A4643',
      maxLines: 1,
      overflowPolicy: 'shrink'
    });
  });

  const featureLabels = Array.isArray(content.featureLabels) ? content.featureLabels : [];
  featureLabels.forEach((fl: string, idx: number) => {
    slots.push({
      slotKey: `feature_label_${idx}`,
      semanticRole: 'feature_label',
      content: String(fl || ''),
      enabled: true,
      fontSize: 30,
      fontWeight: 600,
      color: '#2C2A29',
      maxLines: 1,
      overflowPolicy: 'shrink'
    });
  });

  const specs = Array.isArray(content.specs) ? content.specs : [];
  specs.forEach((sp: any, idx: number) => {
    const str = typeof sp === 'string' ? sp : `${sp?.label || ''}: ${sp?.value || ''}`;
    slots.push({
      slotKey: `spec_${idx}`,
      semanticRole: 'spec',
      content: str,
      enabled: true,
      fontSize: 26,
      fontWeight: 400,
      color: '#666059',
      maxLines: 1,
      overflowPolicy: 'truncate'
    });
  });

  if (content.cta) {
    slots.push({
      slotKey: 'cta',
      semanticRole: 'cta',
      content: String(content.cta),
      enabled: true,
      fontSize: 32,
      fontWeight: 700,
      color: '#FFFFFF',
      maxLines: 1,
      overflowPolicy: 'truncate'
    });
  }

  if (content.disclaimer) {
    slots.push({
      slotKey: 'disclaimer',
      semanticRole: 'disclaimer',
      content: String(content.disclaimer),
      enabled: true,
      fontSize: 22,
      fontWeight: 400,
      color: '#99938B',
      maxLines: 2,
      overflowPolicy: 'shrink'
    });
  }

  return slots;
}

/**
 * Converts Typography Spec slots to standard TextLayer objects for rendering
 */
export function convertTypographySlotsToTextLayers(
  slots: any[],
  slotHeight: number
): TextLayer[] {
  const textLayers: TextLayer[] = [];

  // Anchor points for layout calculation
  const topMargin = 120;
  let currentTopY = topMargin;

  const activeSlots = slots.filter(s => s.enabled !== false && s.content && String(s.content).trim().length > 0);

  // Group slots by semantic role
  const eyebrowSlot = activeSlots.find(s => s.semanticRole === 'eyebrow' || s.slotKey === 'eyebrow');
  const headlineSlot = activeSlots.find(s => s.semanticRole === 'headline' || s.slotKey === 'headline');
  const subheadlineSlot = activeSlots.find(s => s.semanticRole === 'subheadline' || s.slotKey === 'subheadline');
  const bodySlot = activeSlots.find(s => s.semanticRole === 'body' || s.slotKey === 'body');
  const ctaSlot = activeSlots.find(s => s.semanticRole === 'cta' || s.slotKey === 'cta');
  const disclaimerSlot = activeSlots.find(s => s.semanticRole === 'disclaimer' || s.slotKey === 'disclaimer');
  const sellingPointSlots = activeSlots.filter(s => s.semanticRole === 'selling_point' || s.slotKey.startsWith('selling_point'));
  const featureLabelSlots = activeSlots.filter(s => s.semanticRole === 'feature_label' || s.slotKey.startsWith('feature_label'));
  const specSlots = activeSlots.filter(s => s.semanticRole === 'spec' || s.slotKey.startsWith('spec'));

  // 1. Eyebrow
  if (eyebrowSlot) {
    textLayers.push({
      id: `tl_${eyebrowSlot.slotKey || 'eyebrow'}`,
      slotKey: eyebrowSlot.slotKey || 'eyebrow',
      copyField: 'eyebrow',
      text: eyebrowSlot.content,
      x: eyebrowSlot.x ?? 120,
      y: eyebrowSlot.y ?? currentTopY,
      width: eyebrowSlot.width ?? 1860,
      height: eyebrowSlot.height ?? 80,
      fontFamily: eyebrowSlot.fontFamily || 'PingFang SC',
      fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      fontSize: eyebrowSlot.fontSize || 36,
      fontWeight: eyebrowSlot.fontWeight || 700,
      lineHeight: eyebrowSlot.lineHeight || 1.3,
      letterSpacing: eyebrowSlot.letterSpacing || 1,
      color: eyebrowSlot.color || '#B28C5A',
      textAlign: eyebrowSlot.textAlign || 'left',
      verticalAlign: 'top',
      maxLines: eyebrowSlot.maxLines || 1,
      overflow: eyebrowSlot.overflowPolicy || 'shrink',
      rotation: 0,
      opacity: 1,
      zIndex: 20,
      safeAreaRequired: true
    });
    currentTopY += 90;
  }

  // 2. Headline
  if (headlineSlot) {
    textLayers.push({
      id: `tl_${headlineSlot.slotKey || 'headline'}`,
      slotKey: headlineSlot.slotKey || 'headline',
      copyField: 'headline',
      text: headlineSlot.content,
      x: headlineSlot.x ?? 120,
      y: headlineSlot.y ?? currentTopY,
      width: headlineSlot.width ?? 1860,
      height: headlineSlot.height ?? 240,
      fontFamily: headlineSlot.fontFamily || 'PingFang SC',
      fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      fontSize: headlineSlot.fontSize || 76,
      fontWeight: headlineSlot.fontWeight || 900,
      lineHeight: headlineSlot.lineHeight || 1.2,
      letterSpacing: headlineSlot.letterSpacing || 2,
      color: headlineSlot.color || '#2C2A29',
      textAlign: headlineSlot.textAlign || 'left',
      verticalAlign: 'top',
      maxLines: headlineSlot.maxLines || 2,
      overflow: headlineSlot.overflowPolicy || 'shrink',
      rotation: 0,
      opacity: 1,
      zIndex: 20,
      safeAreaRequired: true
    });
    currentTopY += 250;
  }

  // 3. Subheadline
  if (subheadlineSlot) {
    textLayers.push({
      id: `tl_${subheadlineSlot.slotKey || 'subheadline'}`,
      slotKey: subheadlineSlot.slotKey || 'subheadline',
      copyField: 'subheadline',
      text: subheadlineSlot.content,
      x: subheadlineSlot.x ?? 120,
      y: subheadlineSlot.y ?? currentTopY,
      width: subheadlineSlot.width ?? 1860,
      height: subheadlineSlot.height ?? 120,
      fontFamily: subheadlineSlot.fontFamily || 'PingFang SC',
      fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      fontSize: subheadlineSlot.fontSize || 42,
      fontWeight: subheadlineSlot.fontWeight || 700,
      lineHeight: subheadlineSlot.lineHeight || 1.3,
      letterSpacing: subheadlineSlot.letterSpacing || 1,
      color: subheadlineSlot.color || '#8C8275',
      textAlign: subheadlineSlot.textAlign || 'left',
      verticalAlign: 'top',
      maxLines: subheadlineSlot.maxLines || 2,
      overflow: subheadlineSlot.overflowPolicy || 'shrink',
      rotation: 0,
      opacity: 1,
      zIndex: 20,
      safeAreaRequired: true
    });
  }

  // Bottom Anchor Calculations
  const bottomMargin = 100;
  let currentBottomY = slotHeight - bottomMargin;

  // Disclaimer at bottom
  if (disclaimerSlot) {
    currentBottomY -= 80;
    textLayers.push({
      id: `tl_${disclaimerSlot.slotKey || 'disclaimer'}`,
      slotKey: disclaimerSlot.slotKey || 'disclaimer',
      copyField: 'disclaimer',
      text: disclaimerSlot.content,
      x: disclaimerSlot.x ?? 120,
      y: disclaimerSlot.y ?? currentBottomY,
      width: disclaimerSlot.width ?? 1860,
      height: disclaimerSlot.height ?? 80,
      fontFamily: disclaimerSlot.fontFamily || 'PingFang SC',
      fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      fontSize: disclaimerSlot.fontSize || 22,
      fontWeight: disclaimerSlot.fontWeight || 400,
      lineHeight: disclaimerSlot.lineHeight || 1.3,
      letterSpacing: 0,
      color: disclaimerSlot.color || '#99938B',
      textAlign: disclaimerSlot.textAlign || 'left',
      verticalAlign: 'bottom',
      maxLines: disclaimerSlot.maxLines || 2,
      overflow: disclaimerSlot.overflowPolicy || 'shrink',
      rotation: 0,
      opacity: 1,
      zIndex: 20,
      safeAreaRequired: true
    });
  }

  // CTA button area
  if (ctaSlot) {
    currentBottomY -= 110;
    textLayers.push({
      id: `tl_${ctaSlot.slotKey || 'cta'}`,
      slotKey: ctaSlot.slotKey || 'cta',
      copyField: 'cta',
      text: ctaSlot.content,
      x: ctaSlot.x ?? 1500,
      y: ctaSlot.y ?? currentBottomY,
      width: ctaSlot.width ?? 480,
      height: ctaSlot.height ?? 100,
      fontFamily: ctaSlot.fontFamily || 'PingFang SC',
      fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      fontSize: ctaSlot.fontSize || 32,
      fontWeight: ctaSlot.fontWeight || 700,
      lineHeight: 1.0,
      letterSpacing: 1,
      color: ctaSlot.color || '#FFFFFF',
      textAlign: ctaSlot.textAlign || 'center',
      verticalAlign: 'middle',
      maxLines: ctaSlot.maxLines || 1,
      overflow: ctaSlot.overflowPolicy || 'truncate',
      rotation: 0,
      opacity: 1,
      zIndex: 25,
      safeAreaRequired: true
    });
  }

  // Body text
  if (bodySlot) {
    currentBottomY -= 190;
    textLayers.push({
      id: `tl_${bodySlot.slotKey || 'body'}`,
      slotKey: bodySlot.slotKey || 'body',
      copyField: 'body',
      text: bodySlot.content,
      x: bodySlot.x ?? 120,
      y: bodySlot.y ?? currentBottomY,
      width: bodySlot.width ?? (ctaSlot ? 1320 : 1860),
      height: bodySlot.height ?? 180,
      fontFamily: bodySlot.fontFamily || 'PingFang SC',
      fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      fontSize: bodySlot.fontSize || 28,
      fontWeight: bodySlot.fontWeight || 400,
      lineHeight: bodySlot.lineHeight || 1.5,
      letterSpacing: 0,
      color: bodySlot.color || '#666059',
      textAlign: bodySlot.textAlign || 'left',
      verticalAlign: 'top',
      maxLines: bodySlot.maxLines || 3,
      overflow: bodySlot.overflowPolicy || 'ellipsis',
      rotation: 0,
      opacity: 1,
      zIndex: 20,
      safeAreaRequired: true
    });
  }

  // Selling points
  if (sellingPointSlots.length > 0) {
    currentBottomY -= (sellingPointSlots.length * 70 + 20);
    sellingPointSlots.forEach((sp, idx) => {
      textLayers.push({
        id: `tl_${sp.slotKey || `selling_point_${idx}`}`,
        slotKey: sp.slotKey || `selling_point_${idx}`,
        copyField: 'selling_point',
        text: sp.content,
        x: sp.x ?? 120,
        y: sp.y ?? (currentBottomY + idx * 70),
        width: sp.width ?? 1860,
        height: sp.height ?? 60,
        fontFamily: sp.fontFamily || 'PingFang SC',
        fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
        fontSize: sp.fontSize || 34,
        fontWeight: sp.fontWeight || 600,
        lineHeight: 1.3,
        letterSpacing: 0,
        color: sp.color || '#4A4643',
        textAlign: sp.textAlign || 'left',
        verticalAlign: 'top',
        maxLines: sp.maxLines || 1,
        overflow: sp.overflowPolicy || 'shrink',
        rotation: 0,
        opacity: 1,
        zIndex: 20,
        safeAreaRequired: true
      });
    });
  }

  // Feature labels
  if (featureLabelSlots.length > 0) {
    featureLabelSlots.forEach((fl, idx) => {
      textLayers.push({
        id: `tl_${fl.slotKey || `feature_label_${idx}`}`,
        slotKey: fl.slotKey || `feature_label_${idx}`,
        copyField: 'feature_label',
        text: fl.content,
        x: fl.x ?? (120 + (idx % 3) * 600),
        y: fl.y ?? (slotHeight / 2 + Math.floor(idx / 3) * 80),
        width: fl.width ?? 540,
        height: fl.height ?? 70,
        fontFamily: fl.fontFamily || 'PingFang SC',
        fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
        fontSize: fl.fontSize || 30,
        fontWeight: fl.fontWeight || 600,
        lineHeight: 1.3,
        letterSpacing: 0,
        color: fl.color || '#2C2A29',
        textAlign: fl.textAlign || 'left',
        verticalAlign: 'top',
        maxLines: fl.maxLines || 1,
        overflow: fl.overflowPolicy || 'shrink',
        rotation: 0,
        opacity: 1,
        zIndex: 20,
        safeAreaRequired: true
      });
    });
  }

  // Specs
  if (specSlots.length > 0) {
    specSlots.forEach((sp, idx) => {
      textLayers.push({
        id: `tl_${sp.slotKey || `spec_${idx}`}`,
        slotKey: sp.slotKey || `spec_${idx}`,
        copyField: 'spec',
        text: sp.content,
        x: sp.x ?? 120,
        y: sp.y ?? (slotHeight - 600 + idx * 50),
        width: sp.width ?? 1860,
        height: sp.height ?? 45,
        fontFamily: sp.fontFamily || 'PingFang SC',
        fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
        fontSize: sp.fontSize || 26,
        fontWeight: sp.fontWeight || 400,
        lineHeight: 1.3,
        letterSpacing: 0,
        color: sp.color || '#666059',
        textAlign: sp.textAlign || 'left',
        verticalAlign: 'top',
        maxLines: sp.maxLines || 1,
        overflow: sp.overflowPolicy || 'truncate',
        rotation: 0,
        opacity: 1,
        zIndex: 20,
        safeAreaRequired: true
      });
    });
  }

  return textLayers;
}

/**
 * Main Assemble Service: Builds a complete, valid ScreenCompositionV2 from real database versions
 */
export async function assembleScreenComposition(
  input: CompositionAssembleInput
): Promise<ScreenCompositionV2> {
  const { canvasId, workspaceId = 'default_workspace', requestedBy = 'system' } = input;
  const screenId = input.screenId || 'screen-01';

  // Normalize scene key (e.g., 'screen-01' -> 'scene-01')
  const sceneIndexStr = screenId.replace(/[^0-9]/g, '').padStart(2, '0') || '01';
  const sceneKey = input.sceneKey || `scene-${sceneIndexStr}`;

  // 1. Fetch Layout Manifest for canvasId to obtain slot specification
  let slotHeight = 2800;
  let fitMode: 'contain' | 'cover' | 'smart_crop' = 'cover';
  let focalPoint = { x: 0.5, y: 0.5 };
  let subjectBounds = null;
  let safeArea = { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 };
  let backgroundColor = '#FAF8F5';
  let manifestAssetVersionId = input.baseAssetVersionId || '';
  let layoutManifestId = input.layoutManifestId || 'manifest_default';

  try {
    const manifest = await LayoutManifestService.getCurrentManifest(canvasId);
    if (manifest) {
      layoutManifestId = manifest.manifestId;
      const screen = manifest.screens?.find(s => s.sceneKey === sceneKey || s.sceneKey === `scene-${screenId.replace(/[^0-9]/g, '').padStart(2, '0')}`)
        || (manifest as any).slots?.find((s: any) => s.sceneKey === sceneKey || s.sceneKey === `scene-${screenId.replace(/[^0-9]/g, '').padStart(2, '0')}`);
      if (screen) {
        slotHeight = 2800;
        fitMode = screen.fitMode || fitMode;
        focalPoint = screen.focalPoint || focalPoint;
        subjectBounds = (screen as any).subjectBounds || null;
        safeArea = screen.safeArea || safeArea;
        backgroundColor = screen.backgroundColor || backgroundColor;
        if (!manifestAssetVersionId && screen.assetVersionId) {
          manifestAssetVersionId = screen.assetVersionId;
        }
      }
    }
  } catch (e) {
    console.warn('[CompositionAssembler] Layout Manifest fallback to defaults:', e);
  }

  // 2. Resolve Base Asset Version
  const baseAssetVersionId = input.baseAssetVersionId || manifestAssetVersionId || `asset_ver_${sceneKey}_default`;
  let objectKey = `compositions/${sceneKey}/${baseAssetVersionId}.jpg`;
  let sourceWidth = 1920;
  let sourceHeight = 1080;
  let sourceAspectRatio = '16:9';

  try {
    const { data: assetData } = await supabaseAdmin
      .from('asset_versions')
      .select('*')
      .eq('id', baseAssetVersionId)
      .maybeSingle();

    if (assetData) {
      objectKey = assetData.object_key || objectKey;
      sourceWidth = assetData.width || sourceWidth;
      sourceHeight = assetData.height || sourceHeight;
      sourceAspectRatio = assetData.aspect_ratio || `${sourceWidth}:${sourceHeight}`;
    }
  } catch (e) {}

  // 3. Resolve Copy SKU and Copy Version content_json
  let copySkuId = input.copySkuId || `copy_sku_${canvasId}_${sceneKey}`;
  let copyVersionId = input.copyVersionId || '';
  let copyContentJson: any = null;
  const sceneNumber = parseInt(screenId.replace(/[^0-9]/g, ''), 10) || 1;
  const normSceneKey = `scene-${String(sceneNumber).padStart(2, '0')}`;
  const altSceneKey = `screen-${String(sceneNumber).padStart(2, '0')}`;

  try {
    // A. Direct Copy Version ID lookup
    if (copyVersionId) {
      try {
        const { data: copyVerData } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('id', copyVersionId)
          .maybeSingle();

        if (copyVerData) {
          copySkuId = copyVerData.copy_sku_id || copySkuId;
          copyContentJson = copyVerData.content_json || null;
        }
      } catch (e) {}

      if (!copyContentJson) {
        for (const verList of inMemoryCopyVersions.values()) {
          const found = verList.find(v => v.id === copyVersionId);
          if (found) {
            copyContentJson = found.content_json;
            copySkuId = found.copy_sku_id || copySkuId;
            break;
          }
        }
      }
    }

    // B. Copy SKU ID lookup
    if (!copyContentJson && copySkuId) {
      try {
        const { data: copySkuData } = await supabaseAdmin
          .from('copy_skus')
          .select('*')
          .eq('id', copySkuId)
          .maybeSingle();

        if (copySkuData && copySkuData.current_version_id) {
          copyVersionId = copySkuData.current_version_id;
          const { data: vData } = await supabaseAdmin
            .from('copy_versions')
            .select('*')
            .eq('id', copyVersionId)
            .maybeSingle();
          if (vData) copyContentJson = vData.content_json;
        }
      } catch (e) {}

      if (!copyContentJson && inMemoryCopySkus.has(copySkuId)) {
        const sku = inMemoryCopySkus.get(copySkuId);
        const versions = inMemoryCopyVersions.get(copySkuId) || [];
        if (versions.length > 0) {
          const activeVer = versions.find(v => v.id === sku.current_version_id) || versions[versions.length - 1];
          copyContentJson = activeVer.content_json;
          copyVersionId = activeVer.id;
        }
      }
    }

    // C. Canvas & Scene Key lookup in memory
    if (!copyContentJson) {
      for (const [skuId, sku] of inMemoryCopySkus.entries()) {
        if (
          sku.canvas_id === canvasId &&
          (sku.scene_key === sceneKey ||
            sku.scene_key === normSceneKey ||
            sku.scene_key === altSceneKey ||
            sku.scene_key === `screen-${sceneNumber}` ||
            sku.scene_key === `scene-${sceneNumber}`)
        ) {
          const versions = inMemoryCopyVersions.get(skuId) || [];
          if (versions.length > 0) {
            const activeVer = versions.find(v => v.id === sku.current_version_id) || versions[versions.length - 1];
            copyContentJson = activeVer.content_json;
            copyVersionId = activeVer.id;
            copySkuId = skuId;
            break;
          }
        }
      }
    }

    // D. Canvas node draft extraction from .data/canvases
    if (!copyContentJson) {
      try {
        const canvasFile = path.join(process.cwd(), '.data', 'canvases', `${canvasId}.json`);
        if (fs.existsSync(canvasFile)) {
          const raw = fs.readFileSync(canvasFile, 'utf-8');
          const canvasData = JSON.parse(raw);
          const nodes = canvasData?.canvas_state?.nodes || canvasData?.nodes || [];
          for (const node of nodes) {
            if (node.type === 'copyWorkspaceNode' || node.type === 'scenePlanNode' || node.type === 'nineGridPlanNode') {
              const nodeData = node.data || {};
              if (nodeData.sceneKey === sceneKey || nodeData.sceneKey === normSceneKey || nodeData.sceneIndex === sceneNumber - 1) {
                if (nodeData.headline || nodeData.copyContent) {
                  copyContentJson = nodeData.copyContent || {
                    headline: nodeData.headline,
                    subheadline: nodeData.subheadline,
                    eyebrow: nodeData.eyebrow,
                    body: nodeData.body,
                    sellingPoints: nodeData.sellingPoints,
                    cta: nodeData.cta
                  };
                  break;
                }
              }
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {
    console.warn('[CompositionAssembler] Copy version lookup fallback:', e);
  }

  // Fallback defaults tailored to specific 9-screen roles if copy content json is missing
  if (!copyContentJson) {
    copyVersionId = copyVersionId || `copy_ver_${sceneKey}_default`;
    copyContentJson = getSceneDefaultCopyContent(sceneNumber);
  }

  // 4. Resolve Typography Spec for copyVersionId / sceneKey
  let typographySpecId = input.typographySpecId || '';
  let typographySlots: any[] = [];

  try {
    if (typographySpecId) {
      const { data: specData } = await supabaseAdmin
        .from('typography_specs')
        .select('*')
        .eq('id', typographySpecId)
        .maybeSingle();

      if (specData && Array.isArray(specData.slots)) {
        typographySlots = specData.slots;
      }
    }

    if (typographySlots.length === 0) {
      const { data: specData } = await supabaseAdmin
        .from('typography_specs')
        .select('*')
        .eq('canvas_id', canvasId)
        .in('scene_key', [sceneKey, normSceneKey, altSceneKey])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (specData) {
        typographySpecId = specData.id;
        if (Array.isArray(specData.slots)) typographySlots = specData.slots;
      }
    }

    if (typographySlots.length === 0) {
      const comboKey = `default_project:${canvasId}:${normSceneKey}`;
      const inMemSpec = inMemoryTypographySpecs.get(comboKey) || inMemoryTypographySpecs.get(`default_project:${canvasId}:${sceneKey}`);
      if (inMemSpec && Array.isArray(inMemSpec.slots)) {
        typographySlots = inMemSpec.slots;
        typographySpecId = inMemSpec.id;
      }
    }
  } catch (e) {}

  if (typographySlots.length === 0) {
    typographySpecId = typographySpecId || `spec_typography_${normSceneKey}_${Date.now()}`;
    typographySlots = buildDefaultTypographySlotsFromCopyContent(copyContentJson);
  } else if (copyContentJson) {
    // Synchronize slot content text with active copyContentJson to eliminate copy/layout mismatch
    const sellingPoints = Array.isArray(copyContentJson.sellingPoints) ? copyContentJson.sellingPoints : [];
    const featureLabels = Array.isArray(copyContentJson.featureLabels) ? copyContentJson.featureLabels : [];
    const specs = Array.isArray(copyContentJson.specs) ? copyContentJson.specs : [];

    typographySlots = typographySlots.map(slot => {
      const s = { ...slot };
      if ((s.semanticRole === 'headline' || s.slotKey === 'headline') && typeof copyContentJson.headline === 'string') {
        s.content = copyContentJson.headline;
      } else if ((s.semanticRole === 'subheadline' || s.slotKey === 'subheadline') && typeof copyContentJson.subheadline === 'string') {
        s.content = copyContentJson.subheadline;
      } else if ((s.semanticRole === 'eyebrow' || s.slotKey === 'eyebrow') && typeof copyContentJson.eyebrow === 'string') {
        s.content = copyContentJson.eyebrow;
      } else if ((s.semanticRole === 'body' || s.slotKey === 'body') && typeof copyContentJson.body === 'string') {
        s.content = copyContentJson.body;
      } else if ((s.semanticRole === 'cta' || s.slotKey === 'cta') && typeof copyContentJson.cta === 'string') {
        s.content = copyContentJson.cta;
      } else if ((s.semanticRole === 'disclaimer' || s.slotKey === 'disclaimer') && typeof copyContentJson.disclaimer === 'string') {
        s.content = copyContentJson.disclaimer;
      } else if (s.semanticRole === 'selling_point' || s.slotKey?.startsWith('selling_point')) {
        const match = (s.slotKey || '').match(/selling_point_(\d+)/);
        const idx = match ? parseInt(match[1], 10) : 0;
        if (idx < sellingPoints.length && sellingPoints[idx]) {
          s.content = String(sellingPoints[idx]);
        }
      } else if (s.semanticRole === 'feature_label' || s.slotKey?.startsWith('feature_label')) {
        const match = (s.slotKey || '').match(/feature_label_(\d+)/);
        const idx = match ? parseInt(match[1], 10) : 0;
        if (idx < featureLabels.length && featureLabels[idx]) {
          s.content = String(featureLabels[idx]);
        }
      } else if (s.semanticRole === 'spec' || s.slotKey?.startsWith('spec')) {
        const match = (s.slotKey || '').match(/spec_(\d+)/);
        const idx = match ? parseInt(match[1], 10) : 0;
        if (idx < specs.length && specs[idx]) {
          const sp = specs[idx];
          s.content = typeof sp === 'string' ? sp : `${sp?.label || ''}: ${sp?.value || ''}`;
        }
      }
      return s;
    });
  }

  // 5. Convert Typography Slots to TextLayers using Aesthetic Layout Solver
  const aestheticResult = computeDeterministicAestheticLayout(typographySlots, {
    sceneKey,
    sceneRole: input.screenRole || 'PRODUCT_HERO',
    slotWidth: 2100,
    slotHeight,
    copyContent: copyContentJson
  });
  const textLayers = aestheticResult.textLayers;

  // 6. Build ImageLayers
  const imageLayers: ImageLayer[] = [
    {
      id: `img_layer_${sceneKey}_base`,
      assetVersionId: baseAssetVersionId,
      objectKey,
      sourceWidth,
      sourceHeight,
      sourceAspectRatio,
      x: 0,
      y: 0,
      width: 2100,
      height: slotHeight,
      fitMode,
      focalPoint,
      subjectBounds,
      safeArea,
      backgroundColor,
      opacity: 1,
      zIndex: 1
    }
  ];

  // 7. Construct Composition V2 Object
  const timestamp = Date.now();
  const compositionId = `comp_${screenId}_${canvasId}`;
  const compositionVersionId = `comp_ver_${screenId}_${timestamp}`;

  const composition: ScreenCompositionV2 = {
    schemaVersion: 'screen-composition/v2',
    compositionId,
    compositionVersionId,
    workspaceId,
    canvasId,
    screenId,
    screenRole: input.screenRole || 'PRODUCT_HERO',
    width: 2100,
    height: 2800,
    layoutManifestId,
    baseAssetVersionId,
    productDnaVersionId: input.productDnaVersionId || `dna_ver_${canvasId}_v001`,
    copySkuId,
    copyVersionId,
    typographySpecId,
    consistencyReportId: input.consistencyReportId || `rep_pass_${sceneKey}`,
    backgroundColor,
    imageLayers,
    textLayers,
    status: 'draft',
    checksum: ''
  };

  composition.checksum = calculateCompositionChecksum(composition);

  // 8. Persist into detail_compositions and detail_composition_versions
  try {
    await supabaseAdmin
      .from('detail_compositions')
      .upsert({
        id: compositionId,
        workspace_id: workspaceId,
        canvas_id: canvasId,
        screen_id: screenId,
        screen_role: composition.screenRole,
        status: 'draft',
        current_version_id: compositionVersionId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    await supabaseAdmin
      .from('detail_composition_versions')
      .insert({
        id: compositionVersionId,
        composition_id: compositionId,
        workspace_id: workspaceId,
        canvas_id: canvasId,
        screen_id: screenId,
        version_number: 1,
        asset_version_id: null,
        layout_schema: {
          width: 2100,
          height: slotHeight,
          layoutManifestId,
          copySkuId,
          copyVersionId,
          typographySpecId,
          productDnaVersionId: composition.productDnaVersionId,
          consistencyReportId: composition.consistencyReportId,
          status: 'draft'
        },
        text_layers: textLayers,
        image_layers: imageLayers,
        checksum: composition.checksum,
        created_at: new Date().toISOString()
      });
  } catch (e: any) {
    console.warn('[CompositionAssembler] DB persist fallback to memory:', e?.message);
  }

  // Memory fallback storage
  memoryCompositions.set(compositionId, composition);
  memoryCompositionVersions.set(compositionVersionId, composition);

  return composition;
}

export function getMemoryComposition(compositionId: string): ScreenCompositionV2 | null {
  return memoryCompositions.get(compositionId) || null;
}

export function getMemoryCompositionVersion(versionId: string): ScreenCompositionV2 | null {
  return memoryCompositionVersions.get(versionId) || null;
}
