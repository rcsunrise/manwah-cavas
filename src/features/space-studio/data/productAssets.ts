// src/features/space-studio/data/productAssets.ts
// MANWAH Space Studio｜敏华贵族旗舰产品库初始数据
import { ProductAsset } from '../../../types/spaceStudio';

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
    functionCapable: true,
    referenceImages: [
      {
        id: 'ref-front-01',
        type: 'front',
        objectKey: 'projects/default/products/prod-cheers-flagship-01/refs/ref-front-01/original.webp',
        verified: true
      },
      {
        id: 'ref-45deg-01',
        type: '45_deg',
        objectKey: 'projects/default/products/prod-cheers-flagship-01/refs/ref-45deg-01/original.webp',
        verified: true
      },
      {
        id: 'ref-open-01',
        type: 'function_open',
        objectKey: 'projects/default/products/prod-cheers-flagship-01/refs/ref-open-01/original.webp',
        verified: true
      }
    ]
  },
  {
    id: 'prod-cheers-single-02',
    sku: 'MW-CH-1028-1S',
    name: '头等舱单人电动功能躺椅 (太空舱级包裹)',
    role: 'recliner_1seat',
    priority: 'primary',
    identityLock: 'strict',
    dimensions: { width: 920, depth: 980, height: 1040 },
    materials: ['细腻摔纹头层黄牛皮', '零重力无级调节机构', '高回弹太空记忆棉'],
    colors: ['劳斯莱斯橙 (Heritage Amber)', '曜石深灰 (Obsidian Grey)'],
    functionCapable: true,
    referenceImages: [
      {
        id: 'ref-single-45-01',
        type: '45_deg',
        objectKey: 'projects/default/products/prod-cheers-single-02/refs/ref-single-45-01/original.webp',
        verified: true
      },
      {
        id: 'ref-single-open-01',
        type: 'function_open',
        objectKey: 'projects/default/products/prod-cheers-single-02/refs/ref-single-open-01/original.webp',
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
    functionCapable: false,
    referenceImages: []
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
    functionCapable: false,
    referenceImages: []
  }
];
