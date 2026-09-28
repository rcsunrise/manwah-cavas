// server/repositories/layoutManifestRepository.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../../src/lib/supabase';
import { NinePosterLayoutManifest, NineScreenLayoutManifest, migrateLegacyManifestToPosterV2 } from '../../src/types/layoutManifest';
import { POSTER_SPEC } from '../../src/config/posterSpec';

const MANIFESTS_DIR = path.join(process.cwd(), '.data', 'layout_manifests');

function ensureManifestsDir() {
  try {
    if (!fs.existsSync(MANIFESTS_DIR)) {
      fs.mkdirSync(MANIFESTS_DIR, { recursive: true });
    }
  } catch (e) {}
}

// In-memory store
const inMemoryManifests = new Map<string, NinePosterLayoutManifest>();
// Map canvasId -> manifestIds[]
const canvasManifestIndex = new Map<string, string[]>();

function persistToDiskAtomic(manifest: NinePosterLayoutManifest) {
  ensureManifestsDir();
  try {
    const finalPath = path.join(MANIFESTS_DIR, `${manifest.manifestId}.json`);
    const tempPath = path.join(MANIFESTS_DIR, `${manifest.manifestId}.tmp.${Date.now()}`);
    fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), 'utf-8');
    fs.renameSync(tempPath, finalPath);
  } catch (e) {
    console.error('Failed to write layout manifest to disk:', e);
  }
}

function loadFromDisk() {
  ensureManifestsDir();
  try {
    const files = fs.readdirSync(MANIFESTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(MANIFESTS_DIR, file), 'utf-8');
        const m = JSON.parse(raw);
        if (m?.manifestId) {
          const posterManifest = (m.schemaVersion === 'poster-layout-manifest/v2' && m.screens)
            ? m
            : migrateLegacyManifestToPosterV2(m);
          inMemoryManifests.set(m.manifestId, posterManifest);
          if (posterManifest.canvasId) {
            const list = canvasManifestIndex.get(posterManifest.canvasId) || [];
            if (!list.includes(posterManifest.manifestId)) {
              list.push(posterManifest.manifestId);
              canvasManifestIndex.set(posterManifest.canvasId, list);
            }
          }
        }
      }
    }
  } catch (e) {}
}

loadFromDisk();

export class LayoutManifestRepository {
  static async saveManifest(manifest: NinePosterLayoutManifest | NineScreenLayoutManifest, userId?: string): Promise<NinePosterLayoutManifest> {
    const posterManifest = ((manifest as any).schemaVersion === 'poster-layout-manifest/v2' && (manifest as any).screens)
      ? (manifest as NinePosterLayoutManifest)
      : migrateLegacyManifestToPosterV2(manifest);

    inMemoryManifests.set(posterManifest.manifestId, posterManifest);
    
    if (posterManifest.canvasId) {
      const list = canvasManifestIndex.get(posterManifest.canvasId) || [];
      if (!list.includes(posterManifest.manifestId)) {
        list.push(posterManifest.manifestId);
        canvasManifestIndex.set(posterManifest.canvasId, list);
      }
    }

    persistToDiskAtomic(posterManifest);

    // Sync to Supabase if table exists
    try {
      await supabaseAdmin
        .from('canvas_layout_manifests')
        .upsert({
          id: posterManifest.manifestId,
          user_id: userId || 'system',
          project_id: posterManifest.projectId,
          canvas_id: posterManifest.canvasId,
          version_number: posterManifest.versionNumber || 1,
          version_code: posterManifest.versionCode || `V${String(posterManifest.versionNumber || 1).padStart(3, '0')}`,
          status: posterManifest.status,
          width_px: POSTER_SPEC.width,
          target_height_px: POSTER_SPEC.height,
          total_computed_height_px: POSTER_SPEC.height,
          manifest_json: posterManifest,
          checksum: posterManifest.checksum,
          created_at: posterManifest.createdAt,
          updated_at: posterManifest.updatedAt
        });
    } catch (e) {
      // Graceful fallback to disk
    }

    return posterManifest;
  }

  static async getManifestById(manifestId: string): Promise<NinePosterLayoutManifest | null> {
    if (inMemoryManifests.has(manifestId)) {
      return inMemoryManifests.get(manifestId)!;
    }

    // Check disk
    const filePath = path.join(MANIFESTS_DIR, `${manifestId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const m = JSON.parse(raw);
        if (m?.manifestId) {
          const posterManifest = (m.schemaVersion === 'poster-layout-manifest/v2' && m.screens)
            ? m
            : migrateLegacyManifestToPosterV2(m);
          inMemoryManifests.set(m.manifestId, posterManifest);
          return posterManifest;
        }
      } catch (e) {}
    }

    // Check Supabase
    try {
      const { data, error } = await supabaseAdmin
        .from('canvas_layout_manifests')
        .select('*')
        .eq('id', manifestId)
        .single();
      if (!error && data?.manifest_json) {
        const m = data.manifest_json;
        const posterManifest = (m.schemaVersion === 'poster-layout-manifest/v2' && m.screens)
          ? m
          : migrateLegacyManifestToPosterV2(m);
        inMemoryManifests.set(manifestId, posterManifest);
        persistToDiskAtomic(posterManifest);
        return posterManifest;
      }
    } catch (e) {}

    return null;
  }

  static async getManifestsByCanvasId(canvasId: string): Promise<NinePosterLayoutManifest[]> {
    const list: NinePosterLayoutManifest[] = [];
    const ids = canvasManifestIndex.get(canvasId) || [];

    for (const id of ids) {
      const m = await this.getManifestById(id);
      if (m) list.push(m);
    }

    // Also scan all in-memory
    for (const m of inMemoryManifests.values()) {
      if (m.canvasId === canvasId && !list.find(x => x.manifestId === m.manifestId)) {
        list.push(m);
      }
    }

    list.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return list;
  }

  static async getCurrentManifest(canvasId: string): Promise<NinePosterLayoutManifest | null> {
    const all = await this.getManifestsByCanvasId(canvasId);
    if (all.length === 0) return null;
    return all[0];
  }
}
