// server/repositories/assetRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';

export interface AssetSkuRecord {
  id: string;
  user_id?: string | null;
  project_id: string;
  canvas_id: string;
  scene_key: string;
  name: string;
  status?: string;
  current_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssetVersionRecord {
  id: string;
  asset_sku_id: string;
  version_number: number;
  parent_version_id?: string | null;
  status: string;
  bucket: string;
  object_key: string;
  preview_object_key?: string | null;
  thumbnail_object_key?: string | null;
  mime_type: string;
  file_size_bytes: number;
  width?: number | null;
  height?: number | null;
  checksum?: string | null;
  generation_provider?: string | null;
  generation_model?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string;
  ready_at?: string | null;
}

export class AssetRepository {
  /**
   * Get or create asset SKU for a canvas sceneKey
   */
  static async getOrCreateAssetSku(
    canvasId: string,
    projectId: string,
    sceneKey: string,
    name?: string,
    userId?: string
  ): Promise<AssetSkuRecord> {
    // 1. Try to find existing
    const { data: existing } = await supabaseAdmin
      .from('asset_skus')
      .select('*')
      .eq('canvas_id', canvasId)
      .eq('scene_key', sceneKey)
      .maybeSingle();

    if (existing) {
      return existing as AssetSkuRecord;
    }

    // 2. Insert new
    const newSku: Partial<AssetSkuRecord> = {
      project_id: projectId,
      canvas_id: canvasId,
      scene_key: sceneKey,
      name: name || `场景资产 ${sceneKey}`,
      status: 'active',
      user_id: userId || null
    };

    const { data, error } = await supabaseAdmin
      .from('asset_skus')
      .upsert(newSku, { onConflict: 'canvas_id,scene_key' })
      .select('*')
      .single();

    if (error) {
      // Fallback read on conflict
      const { data: retry } = await supabaseAdmin
        .from('asset_skus')
        .select('*')
        .eq('canvas_id', canvasId)
        .eq('scene_key', sceneKey)
        .single();
      if (retry) return retry as AssetSkuRecord;
      throw error;
    }

    return data as AssetSkuRecord;
  }

  /**
   * List all asset SKUs for a canvas
   */
  static async listAssetSkusByCanvas(canvasId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('asset_skus')
      .select('*, current_version:asset_versions(*)')
      .eq('canvas_id', canvasId);

    if (error) {
      console.error(`[AssetRepository] listAssetSkusByCanvas(${canvasId}) error:`, error);
      throw error;
    }
    return data || [];
  }

  /**
   * Insert new asset version
   */
  static async insertAssetVersion(version: AssetVersionRecord): Promise<AssetVersionRecord> {
    const { data, error } = await supabaseAdmin
      .from('asset_versions')
      .insert(version)
      .select('*')
      .single();

    if (error) {
      console.error('[AssetRepository] insertAssetVersion error:', error);
      throw error;
    }

    // Update asset_sku current_version_id
    await supabaseAdmin
      .from('asset_skus')
      .update({
        current_version_id: version.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', version.asset_sku_id);

    return data as AssetVersionRecord;
  }

  /**
   * Get asset version by ID
   */
  static async getAssetVersionById(versionId: string): Promise<AssetVersionRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('asset_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (error) {
      console.error(`[AssetRepository] getAssetVersionById(${versionId}) error:`, error);
      throw error;
    }
    return data as AssetVersionRecord | null;
  }

  /**
   * Update asset version status
   */
  static async updateAssetVersionStatus(
    versionId: string,
    status: string,
    extra?: Partial<AssetVersionRecord>
  ): Promise<AssetVersionRecord> {
    const updates: any = {
      status,
      ...extra
    };
    if (status === 'ready' && !updates.ready_at) {
      updates.ready_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('asset_versions')
      .update(updates)
      .eq('id', versionId)
      .select('*')
      .single();

    if (error) {
      console.error(`[AssetRepository] updateAssetVersionStatus(${versionId}) error:`, error);
      throw error;
    }
    return data as AssetVersionRecord;
  }
}
