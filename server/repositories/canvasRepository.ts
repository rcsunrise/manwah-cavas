// server/repositories/canvasRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';
import { isValidUuid, toValidUuid } from '../lib/uuid';

export interface CreativeCanvasRecord {
  id: string;
  project_id: string;
  user_id?: string | null;
  canvas_name: string;
  canvas_status?: string;
  nodes_draft?: any[];
  edges_draft?: any[];
  viewport_draft?: any;
  source_revision_id?: string | null;
  current_revision?: number;
  snapshot_checksum?: string | null;
  created_at?: string;
  updated_at?: string;
  last_saved_at?: string;
}

export interface CanvasRevisionRecord {
  id: string;
  canvas_id: string;
  revision_number: number;
  version_name: string;
  change_summary?: string;
  version_tag?: string;
  status?: string;
  manifest?: any;
  nodes_snapshot?: any[];
  edges_snapshot?: any[];
  viewport_snapshot?: any;
  asset_total?: number;
  asset_ready_count?: number;
  failed_asset_count?: number;
  idempotency_key?: string | null;
  created_at?: string;
  finalized_at?: string | null;
}

export class CanvasRepository {
  /**
   * Get canvas by ID
   */
  static async getCanvasById(id: string): Promise<CreativeCanvasRecord | null> {
    const validId = isValidUuid(id) ? id : toValidUuid(id);
    const { data, error } = await supabaseAdmin
      .from('creative_canvases')
      .select('*')
      .eq('id', validId)
      .maybeSingle();

    if (error) {
      console.error(`[CanvasRepository] getCanvasById(${id}) error:`, error);
      throw error;
    }
    return data as CreativeCanvasRecord | null;
  }

  /**
   * List canvases for a project
   */
  static async listCanvasesByProjectId(projectId: string): Promise<CreativeCanvasRecord[]> {
    const validProjId = isValidUuid(projectId) ? projectId : toValidUuid(projectId);
    const { data, error } = await supabaseAdmin
      .from('creative_canvases')
      .select('*')
      .eq('project_id', validProjId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(`[CanvasRepository] listCanvasesByProjectId(${projectId}) error:`, error);
      throw error;
    }
    return (data || []) as CreativeCanvasRecord[];
  }

  /**
   * Upsert canvas draft state
   */
  static async upsertCanvas(canvas: Partial<CreativeCanvasRecord> & { id: string; project_id: string }): Promise<CreativeCanvasRecord> {
    const validId = isValidUuid(canvas.id) ? canvas.id : toValidUuid(canvas.id);
    const validProjId = isValidUuid(canvas.project_id) ? canvas.project_id : toValidUuid(canvas.project_id);
    const validUserId = canvas.user_id && isValidUuid(canvas.user_id) ? canvas.user_id : (canvas.user_id ? toValidUuid(canvas.user_id) : undefined);

    const record = {
      ...canvas,
      id: validId,
      project_id: validProjId,
      ...(validUserId ? { user_id: validUserId } : {}),
      updated_at: new Date().toISOString(),
      last_saved_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('creative_canvases')
      .upsert(record, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      console.error('[CanvasRepository] upsertCanvas error:', error);
      throw error;
    }
    return data as CreativeCanvasRecord;
  }

  /**
   * Insert immutable revision snapshot
   */
  static async insertRevision(revision: CanvasRevisionRecord): Promise<CanvasRevisionRecord> {
    const validId = isValidUuid(revision.id) ? revision.id : toValidUuid(revision.id);
    const validCanvasId = isValidUuid(revision.canvas_id) ? revision.canvas_id : toValidUuid(revision.canvas_id);

    const normalizedRevision = {
      ...revision,
      id: validId,
      canvas_id: validCanvasId
    };

    const { data, error } = await supabaseAdmin
      .from('canvas_revisions')
      .insert(normalizedRevision)
      .select('*')
      .single();

    if (error) {
      console.error('[CanvasRepository] insertRevision error:', error);
      throw error;
    }
    return data as CanvasRevisionRecord;
  }

  /**
   * Get revisions for a canvas
   */
  static async getRevisions(canvasId: string): Promise<CanvasRevisionRecord[]> {
    const validCanvasId = isValidUuid(canvasId) ? canvasId : toValidUuid(canvasId);
    const { data, error } = await supabaseAdmin
      .from('canvas_revisions')
      .select('*')
      .eq('canvas_id', validCanvasId)
      .order('revision_number', { ascending: false });

    if (error) {
      console.error(`[CanvasRepository] getRevisions(${canvasId}) error:`, error);
      throw error;
    }
    return (data || []) as CanvasRevisionRecord[];
  }

  /**
   * Get single revision by ID
   */
  static async getRevisionById(revisionId: string): Promise<CanvasRevisionRecord | null> {
    const validRevId = isValidUuid(revisionId) ? revisionId : toValidUuid(revisionId);
    const { data, error } = await supabaseAdmin
      .from('canvas_revisions')
      .select('*')
      .eq('id', validRevId)
      .maybeSingle();

    if (error) {
      console.error(`[CanvasRepository] getRevisionById(${revisionId}) error:`, error);
      throw error;
    }
    return data as CanvasRevisionRecord | null;
  }

  /**
   * Link asset versions to a revision via canvas_revision_assets
   */
  static async linkRevisionAssets(
    revisionId: string,
    assets: Array<{ asset_version_id: string; object_key?: string | null; checksum?: string | null; required?: boolean }>
  ): Promise<void> {
    if (!assets || assets.length === 0) return;

    const validRevId = isValidUuid(revisionId) ? revisionId : toValidUuid(revisionId);

    const rows = assets.map(a => ({
      revision_id: validRevId,
      asset_version_id: a.asset_version_id,
      object_key: a.object_key || null,
      checksum: a.checksum || null,
      required: a.required ?? true
    }));

    const { error } = await supabaseAdmin
      .from('canvas_revision_assets')
      .upsert(rows, { onConflict: 'revision_id,asset_version_id' });

    if (error) {
      console.error(`[CanvasRepository] linkRevisionAssets(${revisionId}) error:`, error);
      throw error;
    }
  }

  /**
   * Get linked asset versions for a revision
   */
  static async getRevisionAssets(revisionId: string): Promise<any[]> {
    const validRevId = isValidUuid(revisionId) ? revisionId : toValidUuid(revisionId);
    const { data, error } = await supabaseAdmin
      .from('canvas_revision_assets')
      .select('*, asset:asset_versions(*)')
      .eq('revision_id', validRevId);

    if (error) {
      console.error(`[CanvasRepository] getRevisionAssets(${revisionId}) error:`, error);
      throw error;
    }
    return data || [];
  }
}
