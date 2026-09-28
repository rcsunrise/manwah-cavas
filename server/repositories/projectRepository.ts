// server/repositories/projectRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';
import { isValidUuid } from '../lib/uuid';

export interface CreativeProjectRecord {
  id: string;
  user_id?: string | null;
  owner_id?: string | null;
  title?: string;
  name?: string;
  description?: string | null;
  project_type?: string;
  status?: string;
  settings?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export class ProjectRepository {
  /**
   * List all projects, optionally filtered by user_id
   */
  static async listProjects(userId?: string): Promise<CreativeProjectRecord[]> {
    try {
      let query = supabaseAdmin
        .from('creative_projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId && isValidUuid(userId)) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[ProjectRepository] listProjects Supabase warning (fallback mode):', error.message || error);
        return [];
      }
      return (data || []) as CreativeProjectRecord[];
    } catch (err: any) {
      console.warn('[ProjectRepository] listProjects exception (fallback mode):', err?.message || err);
      return [];
    }
  }

  /**
   * Get project by ID
   */
  static async getProjectById(id: string): Promise<CreativeProjectRecord | null> {
    if (!isValidUuid(id)) {
      return null;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.warn(`[ProjectRepository] getProjectById(${id}) Supabase warning (fallback mode):`, error.message || error);
        return null;
      }
      return data as CreativeProjectRecord | null;
    } catch (err: any) {
      console.warn(`[ProjectRepository] getProjectById(${id}) exception (fallback mode):`, err?.message || err);
      return null;
    }
  }

  /**
   * Create or Upsert project
   */
  static async upsertProject(project: CreativeProjectRecord): Promise<CreativeProjectRecord> {
    if (!isValidUuid(project.id)) {
      throw new Error(`[ProjectRepository] Cannot upsert project with invalid UUID id: ${project.id}`);
    }

    const now = new Date().toISOString();
    const record: any = {
      id: project.id,
      user_id: isValidUuid(project.user_id) ? project.user_id : null,
      title: project.title || project.name || '企划项目',
      status: project.status || 'active',
      created_at: project.created_at || now,
      updated_at: now
    };

    if (project.description) {
      record.description = project.description;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_projects')
        .upsert(record, { onConflict: 'id' })
        .select('*')
        .single();

      if (error) {
        console.warn('[ProjectRepository] Supabase upsert warning (using in-memory/local fallback):', error.message || error);
        return record as CreativeProjectRecord;
      }
      return (data || record) as CreativeProjectRecord;
    } catch (err: any) {
      console.warn('[ProjectRepository] Supabase connection exception (using in-memory/local fallback):', err?.message || err);
      return record as CreativeProjectRecord;
    }
  }

  /**
   * Update existing project
   */
  static async updateProject(id: string, updates: Partial<CreativeProjectRecord>): Promise<CreativeProjectRecord> {
    if (!isValidUuid(id)) {
      throw new Error(`[ProjectRepository] Cannot update project with invalid UUID id: ${id}`);
    }

    const updatedRecord = {
      id,
      ...updates,
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_projects')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.warn(`[ProjectRepository] updateProject(${id}) Supabase warning (fallback mode):`, error.message || error);
        return updatedRecord as CreativeProjectRecord;
      }
      return (data || updatedRecord) as CreativeProjectRecord;
    } catch (err: any) {
      console.warn(`[ProjectRepository] updateProject(${id}) exception (fallback mode):`, err?.message || err);
      return updatedRecord as CreativeProjectRecord;
    }
  }

  /**
   * Delete project by ID
   */
  static async deleteProject(id: string): Promise<boolean> {
    if (!isValidUuid(id)) {
      return false;
    }

    try {
      const { error } = await supabaseAdmin
        .from('creative_projects')
        .delete()
        .eq('id', id);

      if (error) {
        console.warn(`[ProjectRepository] deleteProject(${id}) Supabase warning (fallback mode):`, error.message || error);
        return true;
      }
      return true;
    } catch (err: any) {
      console.warn(`[ProjectRepository] deleteProject(${id}) exception (fallback mode):`, err?.message || err);
      return true;
    }
  }

  /**
   * Ensure project exists, creating it if not present
   */
  static async ensureProjectExists(id: string, userId?: string, name?: string): Promise<CreativeProjectRecord> {
    if (!isValidUuid(id)) {
      throw new Error(`[ProjectRepository] ensureProjectExists requires valid UUID id: ${id}`);
    }

    const existing = await this.getProjectById(id);
    if (existing) return existing;

    const newProject: CreativeProjectRecord = {
      id,
      user_id: isValidUuid(userId) ? userId : null,
      title: name || '敏华功能沙发视觉设计',
      name: name || '敏华功能沙发视觉设计',
      project_type: 'detail_page',
      status: 'active',
      settings: {}
    };
    return this.upsertProject(newProject);
  }
}

