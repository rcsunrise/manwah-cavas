import { describe, expect, it } from 'vitest';
import { normalizeEnsembleAdvice } from '../../../../server/services/spaceLayoutAgentService';
import {
  applyEnsembleAdvice,
  buildAgentEnsemble,
  getEnsembleImageSources,
  isEnsembleAdviceApplied
} from '../data/ensembleAgentBridge';
import { ProductAsset } from '../../../types/spaceStudio';

const product = (id: string, priority: ProductAsset['priority'], isEnsembleIncluded?: boolean, key = `refs/${id}.webp`): ProductAsset =>
  ({
    id,
    name: id,
    role: 'sofa_3seat',
    priority,
    identityLock: 'strict',
    isEnsembleIncluded,
    referenceImages: [{ id: `${id}-ref`, type: 'front', objectKey: key }]
  }) as ProductAsset;

describe('scene ensemble and agent transfer', () => {
  const products = [product('chair', 'secondary', false), product('main', 'primary'), product('table', 'secondary', true)];

  it('sends the ensemble state and puts the primary image first', () => {
    expect(buildAgentEnsemble(products).map((p) => [p.id, p.included])).toEqual([['chair', false], ['main', true], ['table', true]]);
    expect(getEnsembleImageSources(products).map((s) => s[0])).toEqual([
      '/api/space/storage/local-file?key=refs%2Fmain.webp',
      '/api/space/storage/local-file?key=refs%2Ftable.webp'
    ]);
  });

  it('does not send the placeholder image of demo products', () => {
    expect(getEnsembleImageSources([product('prod-cheers-flagship-01', 'primary')])).toEqual([]);
  });

  it('applies advice without ever removing the primary product', () => {
    const items = [
      { productId: 'chair', include: true, reason: '' },
      { productId: 'main', include: false, reason: '' },
      { productId: 'table', include: false, reason: '' }
    ];
    const updated = applyEnsembleAdvice(products, items);
    expect(updated.map((p) => p.isEnsembleIncluded)).toEqual([true, true, false]);
    expect(isEnsembleAdviceApplied(products, { summary: '', items: items.slice(0, 1) })).toBe(false);
    expect(isEnsembleAdviceApplied(updated, { summary: '', items: items.slice(0, 1) })).toBe(true);
  });

  it('drops invented products from model advice and keeps the primary in', () => {
    const ensemble = buildAgentEnsemble(products);
    const advice = normalizeEnsembleAdvice(
      {
        summary: 's',
        items: [
          { productId: 'made-up', include: true, reason: 'x' },
          { productId: 'main', include: false, reason: 'y' },
          { productId: 'chair', include: true, reason: 'z' },
          { productId: 'chair', include: false, reason: 'dup' }
        ]
      },
      ensemble
    );
    expect(advice?.items).toEqual([
      { productId: 'main', include: true, reason: 'y' },
      { productId: 'chair', include: true, reason: 'z' }
    ]);
    expect(normalizeEnsembleAdvice({ items: [{ productId: 'made-up' }] }, ensemble)).toBeUndefined();
  });
});
