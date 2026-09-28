// server/repositories/exportRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';

export interface DetailExportRecord {
  id: string;
  canvas_id: string;
  workspace_id?: string;
  export_version_number: number;
  status: string;
  zip_bucket?: string | null;
  zip_object_key?: string | null;
  zip_filename?: string | null;
  zip_public_url?: string | null;
  zip_file_size_bytes?: number;
  checksum?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DetailExportSliceRecord {
  id?: string;
  export_id: string;
  canvas_id: string;
  slice_index: number;
  scene_key: string;
  filename: string;
  width: number;
  height: number;
  bucket: string;
  object_key: string;
  public_url?: string | null;
  file_size_bytes: number;
  checksum?: string | null;
  status?: string;
  created_at?: string;
}

export class ExportRepository {
  /**
   * Create an export job/record
   */
  static async createExport(record: DetailExportRecord): Promise<DetailExportRecord> {
    const { data, error } = await supabaseAdmin
      .from('detail_exports')
      .insert(record)
      .select('*')
      .single();

    if (error) {
      console.error('[ExportRepository] createExport error:', error);
      throw error;
    }
    return data as DetailExportRecord;
  }

  /**
   * Save the 9 slice records for an export
   */
  static async saveExportSlices(slices: DetailExportSliceRecord[]): Promise<void> {
    if (!slices || slices.length === 0) return;

    const { error } = await supabaseAdmin
      .from('detail_export_slices')
      .upsert(slices, { onConflict: 'export_id,slice_index' });

    if (error) {
      console.error('[ExportRepository] saveExportSlices error:', error);
      throw error;
    }
  }

  /**
   * Get export record with its 9 slices
   */
  static async getExportWithSlices(exportId: string): Promise<any> {
    const { data: exportRec, error: expErr } = await supabaseAdmin
      .from('detail_exports')
      .select('*')
      .eq('id', exportId)
      .maybeSingle();

    if (expErr || !exportRec) {
      return null;
    }

    const { data: slices, error: sliceErr } = await supabaseAdmin
      .from('detail_export_slices')
      .select('*')
      .eq('export_id', exportId)
      .order('slice_index', { ascending: true });

    if (sliceErr) {
      console.error(`[ExportRepository] getSlices(${exportId}) error:`, sliceErr);
    }

    return {
      ...exportRec,
      slices: slices || []
    };
  }

  /**
   * Get latest export for a canvas
   */
  static async getLatestExportByCanvas(canvasId: string): Promise<any> {
    const { data: exportRec, error: expErr } = await supabaseAdmin
      .from('detail_exports')
      .select('*')
      .eq('canvas_id', canvasId)
      .order('export_version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (expErr || !exportRec) return null;

    return this.getExportWithSlices(exportRec.id);
  }
}
