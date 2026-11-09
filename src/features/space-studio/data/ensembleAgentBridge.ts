// 场景产品套组与 AI 户型智能体之间的互传：
// 套组 → 智能体：传产品资料（名称、尺寸、色彩、材质）和产品图；示例产品的图是占位示意，不发送；
// 智能体 → 套组：智能体只能调整产品库里已有的产品，由用户确认后应用。
import { ProductAsset } from '../../../types/spaceStudio';
import { isInitialDemoProduct } from './productAssets';

const MAX_AGENT_PRODUCTS = 40;

/** 从产品面板拖图到智能体窗口时使用的拖放数据类型 */
export const PRODUCT_IMAGE_DRAG_TYPE = 'application/x-manwah-product-image';

export interface AgentEnsembleProduct {
  id: string;
  name: string;
  role: string;
  isPrimary: boolean;
  included: boolean;
  dimensions?: { width: number; depth: number; height: number };
  colors?: string[];
  materials?: string[];
}

export interface AgentEnsembleAdviceItem {
  productId: string;
  include: boolean;
  reason: string;
}

export interface AgentEnsembleAdvice {
  summary: string;
  items: AgentEnsembleAdviceItem[];
}

export const isInEnsemble = (product: ProductAsset): boolean =>
  product.priority === 'primary' || product.isEnsembleIncluded !== false;

/** 产品图的候选地址，按可用性依次尝试；云端地址跨域读不到时退回本地文件 */
export function getProductImageSources(product: ProductAsset): string[] {
  if (isInitialDemoProduct(product)) return [];
  const ref = product.referenceImages?.[0];
  return [
    product.cropBase64,
    product.cropImageUrl,
    ref?.publicUrl,
    ref?.objectKey ? `/api/space/storage/local-file?key=${encodeURIComponent(ref.objectKey)}` : undefined,
    product.sourceMasterImageUrl
  ].filter((src): src is string => Boolean(src));
}

/** 套组里每件产品一张图，主品在前 */
export function getEnsembleImageSources(products: ProductAsset[]): string[][] {
  const seen = new Set<string>();
  return [...products]
    .filter(isInEnsemble)
    .sort((a, b) => Number(b.priority === 'primary') - Number(a.priority === 'primary'))
    .map(getProductImageSources)
    .filter((sources) => {
      if (sources.length === 0 || seen.has(sources[0])) return false;
      seen.add(sources[0]);
      return true;
    });
}

export function buildAgentEnsemble(products: ProductAsset[]): AgentEnsembleProduct[] {
  return products.slice(0, MAX_AGENT_PRODUCTS).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    isPrimary: p.priority === 'primary',
    included: isInEnsemble(p),
    dimensions: p.dimensions,
    colors: p.colors,
    materials: p.materials
  }));
}

/** 只改建议里提到的产品；主品始终留在套组里 */
export function applyEnsembleAdvice(products: ProductAsset[], items: AgentEnsembleAdviceItem[]): ProductAsset[] {
  const decisions = new Map(items.map((item) => [item.productId, item.include]));
  return products.map((p) => {
    if (p.priority === 'primary') return { ...p, isEnsembleIncluded: true };
    const include = decisions.get(p.id);
    return include === undefined ? p : { ...p, isEnsembleIncluded: include };
  });
}

/** 去掉已从产品库删除的产品，避免旧对话记录指向不存在的产品 */
export function getValidAdviceItems(products: ProductAsset[], advice: AgentEnsembleAdvice) {
  return advice.items.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ ...item, product }] : [];
  });
}

export function isEnsembleAdviceApplied(products: ProductAsset[], advice: AgentEnsembleAdvice): boolean {
  return getValidAdviceItems(products, advice).every(({ product, include }) => isInEnsemble(product) === include);
}
