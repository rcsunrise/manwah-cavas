// server/repositories/copyRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';

export interface CopySkuRecord {
  id: string;
  user_id?: string | null;
  project_id: string;
  canvas_id: string;
  scene_key: string;
  sku_code: string;
  name: string;
  status?: string;
  current_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CopyVersionRecord {
  id: string;
  copy_sku_id: string;
  version_number: number;
  version_code: string;
  title: string;
  subtitle?: string | null;
  body_text?: string | null;
  bullet_points?: any;
  call_to_action?: string | null;
  tags?: any;
  custom_fields?: any;
  checksum?: string | null;
  status?: string;
  created_at?: string;
}

export class CopyRepository {
  /**
   * Get or create Copy SKU for a canvas sceneKey
   */
  static async getOrCreateCopySku(
    canvasId: string,
    projectId: string,
    sceneKey: string,
    skuCode?: string,
    name?: string,
    userId?: string
  ): Promise<CopySkuRecord> {
    const { data: existing } = await supabaseAdmin
      .from('copy_skus')
      .select('*')
      .eq('canvas_id', canvasId)
      .eq('scene_key', sceneKey)
      .maybeSingle();

    if (existing) {
      return existing as CopySkuRecord;
    }

    const newSku: Partial<CopySkuRecord> = {
      project_id: projectId,
      canvas_id: canvasId,
      scene_key: sceneKey,
      sku_code: skuCode || `SKU_${sceneKey}`,
      name: name || `文案资产 ${sceneKey}`,
      status: 'active',
      user_id: userId || null
    };

    const { data, error } = await supabaseAdmin
      .from('copy_skus')
      .upsert(newSku, { onConflict: 'canvas_id,scene_key' })
      .select('*')
      .single();

    if (error) {
      const { data: retry } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .eq('canvas_id', canvasId)
        .eq('scene_key', sceneKey)
        .single();
      if (retry) return retry as CopySkuRecord;
      throw error;
    }

    return data as CopySkuRecord;
  }

  /**
   * List all copy SKUs for a canvas
   */
  static async listCopySkusByCanvas(canvasId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('copy_skus')
      .select('*, current_version:copy_versions(*)')
      .eq('canvas_id', canvasId);

    if (error) {
      console.error(`[CopyRepository] listCopySkusByCanvas(${canvasId}) error:`, error);
      throw error;
    }
    return data || [];
  }

  /**
   * Insert new immutable copy version and update current_version_id
   */
  static async insertCopyVersion(
    copySkuId: string,
    versionNumber: number,
    payload: {
      title: string;
      subtitle?: string;
      body_text?: string;
      bullet_points?: any;
      call_to_action?: string;
      tags?: any;
      custom_fields?: any;
      checksum?: string;
    }
  ): Promise<CopyVersionRecord> {
    const versionRecord: Partial<CopyVersionRecord> = {
      copy_sku_id: copySkuId,
      version_number: versionNumber,
      version_code: `V${String(versionNumber).padStart(3, '0')}`,
      title: payload.title,
      subtitle: payload.subtitle || null,
      body_text: payload.body_text || null,
      bullet_points: payload.bullet_points || [],
      call_to_action: payload.call_to_action || null,
      tags: payload.tags || [],
      custom_fields: payload.custom_fields || {},
      checksum: payload.checksum || null,
      status: 'ready'
    };

    const { data, error } = await supabaseAdmin
      .from('copy_versions')
      .insert(versionRecord)
      .select('*')
      .single();

    if (error) {
      console.error('[CopyRepository] insertCopyVersion error:', error);
      throw error;
    }

    // Update copy_sku current_version_id
    await supabaseAdmin
      .from('copy_skus')
      .update({
        current_version_id: data.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', copySkuId);

    return data as CopyVersionRecord;
  }
}
