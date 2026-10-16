// src/features/space-studio/data/productAssets.ts
// MANWAH Space Studio｜敏华贵族旗舰产品库初始数据
import { ProductAsset } from '../../../types/spaceStudio';

const RECLINER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" fill="%231c1917"/><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23ea580c"/><stop offset="100%" stop-color="%239a3412"/></linearGradient></defs><ellipse cx="200" cy="340" rx="140" ry="25" fill="%230c0a09" opacity="0.6"/><rect x="140" y="110" width="120" height="150" rx="35" fill="url(%23g1)"/><rect x="100" y="180" width="45" height="110" rx="20" fill="%23c2410c"/><rect x="255" y="180" width="45" height="110" rx="20" fill="%23c2410c"/><rect x="130" y="240" width="140" height="70" rx="22" fill="%23ea580c"/><rect x="150" y="300" width="100" height="14" rx="7" fill="%2378716c"/><text x="200" y="375" fill="%23fdba74" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">CHEERS RECLINER 1S</text></svg>`;

const TABLE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" fill="%231c1917"/><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23f5f5f4"/><stop offset="100%" stop-color="%23d6d3d1"/></linearGradient></defs><ellipse cx="200" cy="330" rx="150" ry="25" fill="%230c0a09" opacity="0.6"/><circle cx="180" cy="220" r="95" fill="url(%23g2)"/><circle cx="260" cy="250" r="65" fill="%23292524" stroke="%23d97706" stroke-width="3"/><path d="M120 220 Q 180 200 240 230" stroke="%23a8a29e" stroke-width="4" fill="none" opacity="0.5"/><text x="200" y="375" fill="%23f5d0fe" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">PANDORA LUX COFFEE TABLE</text></svg>`;

const SIDE_TABLE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" fill="%231c1917"/><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23b45309"/><stop offset="100%" stop-color="%2378350f"/></linearGradient></defs><ellipse cx="200" cy="330" rx="110" ry="20" fill="%230c0a09" opacity="0.6"/><rect x="190" y="160" width="20" height="160" fill="%23d97706"/><circle cx="200" cy="320" r="60" fill="%23d97706"/><ellipse cx="200" cy="160" rx="90" ry="35" fill="url(%23g3)" stroke="%23fbbf24" stroke-width="2"/><text x="200" y="375" fill="%23fde68a" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">ITALIAN SADDLE SIDE TABLE</text></svg>`;

export const INITIAL_MANWAH_PRODUCTS: ProductAsset[] = [
  {
    id: 'prod-cheers-flagship-01',
    sku: 'MW-CH-9866-3S',
    name: '敏华芝华仕头等舱·旗舰多功能真皮主沙发',
    role: 'sofa_3seat',
    priority: 'primary',
    identityLock: 'strict',
    dimensions: { width: 3100, depth: 1080, height: 950 },
    materials: ['南美进口头层牛皮 (半苯胺)', '德国超静音低压双电机', '高碳钢五金伸缩架'],
    colors: ['云雾暖灰 (Warm Greige)', '鞍褐经典 (Saddle Brown)'],
    adaptiveStyles: ['意式轻奢', '现代极简', '奶油风'],
    isEnsembleIncluded: true,
    functionCapable: true,
    referenceImages: [
      {
        id: 'ref-front-01',
        type: 'front',
        objectKey: 'projects/default/products/prod-cheers-flagship-01/refs/ref-front-01/original.webp',
        publicUrl: RECLINER_SVG,
        verified: true
      }
    ]
  },
  {
    id: 'prod-cheers-single-02',
    sku: 'MW-CH-1028-1S',
    name: '头等舱单人电动功能躺椅 (太空舱级包裹)',
    role: 'recliner_1seat',
    priority: 'secondary',
    identityLock: 'strict',
    dimensions: { width: 920, depth: 980, height: 1040 },
    materials: ['细腻摔纹头层黄牛皮', '零重力无级调节机构', '高回弹太空记忆棉'],
    colors: ['劳斯莱斯橙 (Heritage Amber)', '曜石深灰 (Obsidian Grey)'],
    adaptiveStyles: ['意式轻奢', '轻奢高定', '现代极简'],
    isEnsembleIncluded: true,
    functionCapable: true,
    cropBase64: RECLINER_SVG,
    referenceImages: [
      {
        id: 'ref-single-45-01',
        type: '45_deg',
        objectKey: 'projects/default/products/prod-cheers-single-02/refs/ref-single-45-01/original.webp',
        publicUrl: RECLINER_SVG,
        verified: true
      }
    ]
  },
  {
    id: 'prod-table-lux-03',
    sku: 'MW-TB-8802',
    name: '潘多拉天然奢石主次双拼圆几',
    role: 'coffee_table',
    priority: 'secondary',
    identityLock: 'normal',
    dimensions: { width: 1200, depth: 1200, height: 380 },
    materials: ['巴西进口潘多拉奢石', '哑光黑钛金属底座'],
    colors: ['天然透光奢石纹', '哑黑金属'],
    adaptiveStyles: ['意式轻奢', '现代极简', '侘寂原力'],
    isEnsembleIncluded: true,
    functionCapable: false,
    cropBase64: TABLE_SVG,
    referenceImages: [
      {
        id: 'ref-table-01',
        type: 'front',
        objectKey: 'projects/default/products/prod-table-lux-03/refs/ref-table-01/original.webp',
        publicUrl: TABLE_SVG,
        verified: true
      }
    ]
  },
  {
    id: 'prod-side-lounge-04',
    sku: 'MW-SD-3301',
    name: '马鞍皮意式极简边几',
    role: 'side_table',
    priority: 'decor',
    identityLock: 'normal',
    dimensions: { width: 450, depth: 450, height: 520 },
    materials: ['意大利手工马鞍皮', '香槟金拉丝不锈钢'],
    colors: ['焦糖色', '香槟金'],
    adaptiveStyles: ['意式轻奢', '法式复古', '现代极简'],
    isEnsembleIncluded: true,
    functionCapable: false,
    cropBase64: SIDE_TABLE_SVG,
    referenceImages: [
      {
        id: 'ref-side-01',
        type: 'front',
        objectKey: 'projects/default/products/prod-side-lounge-04/refs/ref-side-01/original.webp',
        publicUrl: SIDE_TABLE_SVG,
        verified: true
      }
    ]
  }
];

/**
 * 判断是否为系统初始内置的敏华示例 Demo 产品
 */
export const isInitialDemoProduct = (
  p: ProductAsset | { id?: string; referenceImages?: any[] } | null | undefined
): boolean => {
  if (!p) return false;
  if (['prod-cheers-flagship-01', 'prod-cheers-single-02', 'prod-table-lux-03', 'prod-side-lounge-04'].includes(p.id || '')) {
    return true;
  }
  const firstRef = p.referenceImages?.[0]?.publicUrl || '';
  if (firstRef.includes('projects/default/') || firstRef.startsWith('data:image/svg+xml')) {
    return true;
  }
  return false;
};

/**
 * 判断当前产品列表中是否全部为系统初始内置的 Demo 示例
 */
export const isOnlyDemoProducts = (list: ProductAsset[]): boolean => {
  return Array.isArray(list) && list.length > 0 && list.every(isInitialDemoProduct);
};

