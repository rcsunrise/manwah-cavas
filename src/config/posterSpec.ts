// src/config/posterSpec.ts

export const POSTER_SPEC = {
  count: 9,
  screenCount: 9,
  width: 2100,
  height: 2800,
  aspectRatio: 3 / 4,
  aspectRatioString: '3:4',
  format: 'jpeg',
} as const;

export type PosterScreenIndex =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9;

export interface PosterScreenDef {
  posterIndex: number;
  sceneKey: string;
  screenId: string;
  title: string;
  sceneRole: string;
}

export const NINE_POSTERS_DEFAULT: PosterScreenDef[] = [
  { posterIndex: 1, sceneKey: 'scene-01', screenId: 'screen-01', title: '首屏主视觉', sceneRole: 'PRODUCT_HERO' },
  { posterIndex: 2, sceneKey: 'scene-02', screenId: 'screen-02', title: '核心卖点拆解屏', sceneRole: 'FUNCTION_DEMO' },
  { posterIndex: 3, sceneKey: 'scene-03', screenId: 'screen-03', title: '家居生活场景屏', sceneRole: 'LIFESTYLE_SCENE' },
  { posterIndex: 4, sceneKey: 'scene-04', screenId: 'screen-04', title: '产品特写细节屏', sceneRole: 'DETAIL_CALLOUT' },
  { posterIndex: 5, sceneKey: 'scene-05', screenId: 'screen-05', title: '功能与舒适演示屏', sceneRole: 'FUNCTION_DEMO' },
  { posterIndex: 6, sceneKey: 'scene-06', screenId: 'screen-06', title: '皮质材质剖析屏', sceneRole: 'MATERIAL_ONLY' },
  { posterIndex: 7, sceneKey: 'scene-07', screenId: 'screen-07', title: '空间搭配灵感屏', sceneRole: 'INSPIRATION_ONLY' },
  { posterIndex: 8, sceneKey: 'scene-08', screenId: 'screen-08', title: '规格尺寸参数屏', sceneRole: 'PARAMETER_SUMMARY' },
  { posterIndex: 9, sceneKey: 'scene-09', screenId: 'screen-09', title: '品牌保障服务屏', sceneRole: 'PARAMETER_SUMMARY' }
];

export function normalizeSceneKey(input: string | number): string {
  let index: number;
  if (typeof input === 'number') {
    index = input;
  } else {
    const match = String(input).match(/(?:scene|screen)[-_]?(\d+)/i) || String(input).match(/^(\d+)$/);
    if (match) {
      index = parseInt(match[1], 10);
    } else {
      throw new Error(`INVALID_SCREEN_KEY:${input}`);
    }
  }

  if (!Number.isInteger(index) || index < 1 || index > POSTER_SPEC.screenCount) {
    throw new Error(`INVALID_SCREEN_INDEX:${index}`);
  }

  return `scene-${String(index).padStart(2, '0')}`;
}

export function normalizeScreenId(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > POSTER_SPEC.screenCount) {
    throw new Error(`INVALID_SCREEN_INDEX:${index}`);
  }

  return `screen-${String(index).padStart(2, '0')}`;
}
