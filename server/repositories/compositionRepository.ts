// server/repositories/compositionRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';

export interface TypographySpecRecord {
  id?: string;
  canvas_id: string;
  scene_key: string;
  copy_sku_id?: string | null;
  copy_version_id?: string | null;
  slots: any[];
  status?: string;
  checksum?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DetailCompositionRecord {
  id: string;
  canvas_id: string;
  scene_key: string;
  screen_id: string;
  screen_role?: string;
  current_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DetailCompositionVersionRecord {
  id: string;
  composition_id: string;
  version_number: number;
  composition_snapshot: Record<string, any>;
  asset_version_id?: string | null;
  copy_version_id?: string | null;
  typography_spec_id?: string | null;
  checksum?: string | null;
  status?: string;
  created_at?: string;
}

export class CompositionRepository {
  /**
   * Get typography spec for canvas scene
   */
  static async getTypographySpec(canvasId: string, sceneKey: string): Promise<TypographySpecRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('typography_specs')
      .select('*')
      .eq('canvas_id', canvasId)
      .eq('scene_key', sceneKey)
      .maybeSingle();

    if (error) {
      console.error(`[CompositionRepository] getTypographySpec(${canvasId}, ${sceneKey}) error:`, error);
      throw error;
    }
    return data as TypographySpecRecord | null;
  }

  /**
   * Upsert typography spec
   */
  static async upsertTypographySpec(spec: TypographySpecRecord): Promise<TypographySpecRecord> {
    const record = {
      ...spec,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('typography_specs')
      .upsert(record, { onConflict: 'canvas_id,scene_key' })
      .select('*')
      .single();

    if (error) {
      console.error('[CompositionRepository] upsertTypographySpec error:', error);
      throw error;
    }
    return data as TypographySpecRecord;
  }

  /**
   * Get or create detail composition
   */
  static async getOrCreateDetailComposition(
    canvasId: string,
    sceneKey: string,
    screenId: string,
    screenRole: string = 'PRODUCT_HERO'
  ): Promise<DetailCompositionRecord> {
    const { data: existing } = await supabaseAdmin
      .from('detail_compositions')
      .select('*')
      .eq('canvas_id', canvasId)
      .eq('scene_key', sceneKey)
      .maybeSingle();

    if (existing) {
      return existing as DetailCompositionRecord;
    }

    const newComp: Partial<DetailCompositionRecord> = {
      canvas_id: canvasId,
      scene_key: sceneKey,
      screen_id: screenId,
      screen_role: screenRole
    };

    const { data, error } = await supabaseAdmin
      .from('detail_compositions')
      .upsert(newComp, { onConflict: 'canvas_id,scene_key' })
      .select('*')
      .single();

    if (error) {
      const { data: retry } = await supabaseAdmin
        .from('detail_compositions')
        .select('*')
        .eq('canvas_id', canvasId)
        .eq('scene_key', sceneKey)
        .single();
      if (retry) return retry as DetailCompositionRecord;
      throw error;
    }

    return data as DetailCompositionRecord;
  }

  /**
   * Insert composition version snapshot and update current_version_id
   */
  static async insertCompositionVersion(
    compositionId: string,
    versionNumber: number,
    snapshot: Record<string, any>,
    links?: {
      asset_version_id?: string | null;
      copy_version_id?: string | null;
      typography_spec_id?: string | null;
      checksum?: string | null;
    }
  ): Promise<DetailCompositionVersionRecord> {
    const versionRecord: Partial<DetailCompositionVersionRecord> = {
      composition_id: compositionId,
      version_number: versionNumber,
      composition_snapshot: snapshot,
      asset_version_id: links?.asset_version_id || null,
      copy_version_id: links?.copy_version_id || null,
      typography_spec_id: links?.typography_spec_id || null,
      checksum: links?.checksum || null,
      status: 'ready'
    };

    const { data, error } = await supabaseAdmin
      .from('detail_composition_versions')
      .insert(versionRecord)
      .select('*')
      .single();

    if (error) {
      console.error('[CompositionRepository] insertCompositionVersion error:', error);
      throw error;
    }

    // Update detail_compositions current_version_id
    await supabaseAdmin
      .from('detail_compositions')
      .update({
        current_version_id: data.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', compositionId);

    return data as DetailCompositionVersionRecord;
  }

  /**
   * List all compositions for a canvas with their current active version
   */
  static async listCompositionsByCanvas(canvasId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('detail_compositions')
      .select('*, current_version:detail_composition_versions(*)')
      .eq('canvas_id', canvasId);

    if (error) {
      console.error(`[CompositionRepository] listCompositionsByCanvas(${canvasId}) error:`, error);
      throw error;
    }
    return data || [];
  }
}
