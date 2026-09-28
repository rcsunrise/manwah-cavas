// src/types/posterTemplate.ts
import { POSTER_SPEC } from '../config/posterSpec';

export type PosterRole =
  | '01_brand_hero'
  | '02_core_selling_point'
  | '03_lifestyle_scene'
  | '04_function_demo'
  | '05_action_sequence'
  | '06_material_detail'
  | '07_comfort_experience'
  | '08_specification_board'
  | '09_brand_closing_cta';

export type TemplateId =
  | 'hero-editorial'
  | 'feature-cards'
  | 'lifestyle-story'
  | 'function-sequence'
  | 'material-detail'
  | 'specification-board'
  | 'split-aesthetic'
  | 'cinematic-overlay';

export interface PosterImageLayer {
  id: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceAspectRatio: number; // e.g. 16/9, 4/3, 1, NEVER forced 3:4

  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;

  fitMode: 'cover' | 'contain';
  focalPoint: {
    x: number;
    y: number;
  };

  imageUrl?: string;
  assetVersionId?: string;
  objectKey?: string;
  bucket?: string;
  backgroundColor?: string;
  opacity?: number;
  zIndex?: number;
}

export interface PosterTextLayer {
  id: string;
  role: string; // 'eyebrow' | 'headline' | 'subheadline' | 'body' | 'selling_point' | 'spec_item' | 'cta' | 'tag'
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily?: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  maxLines?: number;
  opacity?: number;
  zIndex?: number;
}

export interface DecorationLayer {
  id: string;
  type: 'shape' | 'line' | 'icon' | 'gradient' | 'badge';
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  opacity?: number;
  zIndex?: number;
}

export interface PosterTemplate {
  templateId: TemplateId;
  name: string;
  description: string;
  suggestedRoles: PosterRole[];
  imageFrames: Array<{
    key: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fitMode: 'cover' | 'contain';
    defaultFocalPoint?: { x: number; y: number };
  }>;
  textSlots: Array<{
    role: string;
    label: string;
    defaultText: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontToken: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    textAlign: 'left' | 'center' | 'right';
    maxLines: number;
  }>;
  decorationSlots: Array<{
    type: 'shape' | 'line' | 'icon' | 'gradient' | 'badge';
    x: number;
    y: number;
    width: number;
    height: number;
    props: Record<string, unknown>;
  }>;
}

export interface PosterCompositionSnapshot {
  screenIndex: number;
  screenTitle?: string;
  role: PosterRole;
  templateId: TemplateId;
  sourceAssetVersionId: string;
  sourceImageUrl?: string;
  copyVersionId: string;
  imageLayers: PosterImageLayer[];
  textLayers: PosterTextLayer[];
  decorationLayers: DecorationLayer[];
  width: number;
  height: number;
  backgroundColor?: string;
  status: 'pending' | 'generating' | 'review' | 'approved' | 'failed';
  renderedUrl?: string;
  checksum?: string;
  updatedAt?: string;
}

export interface NinePosterManifest {
  schemaVersion: 'nine-poster-manifest/v1';
  canvasId: string;
  posters: Array<{
    screenIndex: number;
    posterCompositionId: string;
    assetVersionId: string;
    width: number;
    height: number;
    checksum: string;
    publicUrl?: string;
  }>;
}
