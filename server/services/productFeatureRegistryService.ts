import { ProductFeatureRegistry, ProductFeatureSpec } from '../../src/types/consistencySchema';
import crypto from 'crypto';

export function buildProductFeatureRegistry(
  productDnaSnapshot: any,
  productDnaVersionId: string,
  workspaceId: string
): ProductFeatureRegistry {
  const features: ProductFeatureSpec[] = [];
  const unmappedSourceFields: string[] = [];

  // TODO: Implement deterministic mapping here as per section 8.1
  // Use productDnaSnapshot to map to features
  
  const registryId = `reg_${productDnaVersionId}_${Date.now()}`;
  const now = new Date().toISOString();
  
  // Deterministic hash based on DNA content
  const sourceHash = crypto.createHash('sha256').update(JSON.stringify(productDnaSnapshot)).digest('hex');

  return {
    schemaVersion: "1.0",
    registryId,
    workspaceId,
    productDnaVersionId,
    status: unmappedSourceFields.length > 0 ? "needs_review" : "ready",
    sourceHash,
    features,
    unmappedSourceFields,
    createdAt: now,
    updatedAt: now
  };
}
