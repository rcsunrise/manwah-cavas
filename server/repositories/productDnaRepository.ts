// server/repositories/productDnaRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';

export interface ProductDnaRecord {
  id: string;
  user_id?: string | null;
  project_id: string;
  canvas_id: string;
  name: string;
  category?: string;
  status?: string;
  current_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductDnaVersionRecord {
  id: string;
  product_dna_id: string;
  version_number: number;
  version_code: string;
  dna_data: Record<string, any>;
  checksum?: string | null;
  status?: string;
  created_at?: string;
}

export class ProductDnaRepository {
  /**
   * Get product DNA by canvas ID
   */
  static async getDnaByCanvasId(canvasId: string): Promise<(ProductDnaRecord & { current_version?: ProductDnaVersionRecord }) | null> {
    const { data, error } = await supabaseAdmin
      .from('product_dnas')
      .select('*, current_version:product_dna_versions(*)')
      .eq('canvas_id', canvasId)
      .maybeSingle();

    if (error) {
      console.error(`[ProductDnaRepository] getDnaByCanvasId(${canvasId}) error:`, error);
      throw error;
    }
    return data as any;
  }

  /**
   * Get product DNA by ID
   */
  static async getDnaById(id: string): Promise<(ProductDnaRecord & { current_version?: ProductDnaVersionRecord }) | null> {
    const { data, error } = await supabaseAdmin
      .from('product_dnas')
      .select('*, current_version:product_dna_versions(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[ProductDnaRepository] getDnaById(${id}) error:`, error);
      throw error;
    }
    return data as any;
  }

  /**
   * Create new product DNA with initial V001 version
   */
  static async createDnaWithVersion(
    dna: Partial<ProductDnaRecord> & { id: string; project_id: string; canvas_id: string; name: string },
    initialData: Record<string, any>,
    initialVersionId: string
  ): Promise<{ dna: ProductDnaRecord; version: ProductDnaVersionRecord }> {
    // 1. Insert product_dnas record
    const dnaRecord: ProductDnaRecord = {
      id: dna.id,
      project_id: dna.project_id,
      canvas_id: dna.canvas_id,
      user_id: dna.user_id || null,
      name: dna.name,
      category: dna.category || 'sofa',
      status: 'active',
      current_version_id: initialVersionId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: dnaErr } = await supabaseAdmin
      .from('product_dnas')
      .insert(dnaRecord);

    if (dnaErr) {
      console.error('[ProductDnaRepository] createDna error:', dnaErr);
      throw dnaErr;
    }

    // 2. Insert initial version
    const verRecord: ProductDnaVersionRecord = {
      id: initialVersionId,
      product_dna_id: dna.id,
      version_number: 1,
      version_code: 'V001',
      dna_data: initialData,
      status: 'ready',
      created_at: new Date().toISOString()
    };

    const { error: verErr } = await supabaseAdmin
      .from('product_dna_versions')
      .insert(verRecord);

    if (verErr) {
      console.error('[ProductDnaRepository] createInitialVersion error:', verErr);
      throw verErr;
    }

    return { dna: dnaRecord, version: verRecord };
  }

  /**
   * Add a new version to existing product DNA and update current_version_id
   */
  static async addVersion(
    productDnaId: string,
    versionId: string,
    versionNumber: number,
    dnaData: Record<string, any>,
    checksum?: string
  ): Promise<ProductDnaVersionRecord> {
    const verRecord: ProductDnaVersionRecord = {
      id: versionId,
      product_dna_id: productDnaId,
      version_number: versionNumber,
      version_code: `V${String(versionNumber).padStart(3, '0')}`,
      dna_data: dnaData,
      checksum: checksum || null,
      status: 'ready',
      created_at: new Date().toISOString()
    };

    const { error: verErr } = await supabaseAdmin
      .from('product_dna_versions')
      .insert(verRecord);

    if (verErr) {
      console.error('[ProductDnaRepository] addVersion error:', verErr);
      throw verErr;
    }

    // Update product_dnas current_version_id
    const { error: updateErr } = await supabaseAdmin
      .from('product_dnas')
      .update({
        current_version_id: versionId,
        updated_at: new Date().toISOString()
      })
      .eq('id', productDnaId);

    if (updateErr) {
      console.error('[ProductDnaRepository] updateCurrentVersion error:', updateErr);
      throw updateErr;
    }

    return verRecord;
  }

  /**
   * Get all versions for a product DNA
   */
  static async getVersions(productDnaId: string): Promise<ProductDnaVersionRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('product_dna_versions')
      .select('*')
      .eq('product_dna_id', productDnaId)
      .order('version_number', { ascending: false });

    if (error) {
      console.error(`[ProductDnaRepository] getVersions(${productDnaId}) error:`, error);
      throw error;
    }
    return (data || []) as ProductDnaVersionRecord[];
  }

  /**
   * Get single version by ID
   */
  static async getVersionById(versionId: string): Promise<ProductDnaVersionRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('product_dna_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (error) {
      console.error(`[ProductDnaRepository] getVersionById(${versionId}) error:`, error);
      throw error;
    }
    return data as ProductDnaVersionRecord | null;
  }
}
