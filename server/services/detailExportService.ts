// server/services/detailExportService.ts
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import * as archiverModule from 'archiver';

function createZipArchiverInstance(options?: any) {
  const ZipClass = (archiverModule as any).ZipArchive || (archiverModule as any).default?.ZipArchive;
  if (typeof ZipClass === 'function') {
    return new ZipClass(options);
  }
  const defaultFn = (archiverModule as any).default || archiverModule;
  if (typeof defaultFn === 'function') {
    return defaultFn('zip', options);
  }
  throw new Error('Archiver zip constructor not available');
}

import { supabaseAdmin } from '../../src/lib/supabase';
import { renderDetailCompositionBitmap } from './detailRenderService';
import { assembleScreenComposition } from './compositionAssemblerService';
import { LayoutManifestService } from './layoutManifestService';
import { POSTER_SPEC, NINE_POSTERS_DEFAULT } from '../../src/config/posterSpec';
import { PosterCompositionSnapshot } from '../../src/types/detailCompositionSchema';

export interface PosterItemExport {
  sceneKey: string;
  posterIndex: number;
  filename: string;
  width: 2100;
  height: 2800;
  assetVersionId: string;
  objectKey: string;
  publicUrl: string;
  fileSizeBytes: number;
  checksum: string;
}

export interface NinePostersExportResult {
  exportId: string;
  workspaceId: string;
  canvasId: string;
  exportVersionNumber: number;
  status: 'ready' | 'failed';
  zipObjectKey?: string;
  zipPublicUrl?: string;
  zipFileSizeBytes?: number;
  zipFilename?: string;
  posters: PosterItemExport[];
  manifest: any;
  createdAt: string;
  errorMessage?: string;
}

const LOCAL_EXPORTS_DIR = path.join(process.cwd(), '.data', 'exports');

function ensureExportsDir() {
  if (!fs.existsSync(LOCAL_EXPORTS_DIR)) {
    fs.mkdirSync(LOCAL_EXPORTS_DIR, { recursive: true });
  }
}

// Memory fallback stores
const memoryExportStore = new Map<string, NinePostersExportResult>();
const localExportVersionsMap = new Map<string, number>();

/**
 * Concurrency helper: processes items with concurrency limit
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Package posters into a ZIP buffer
 */
export async function createNinePostersZip(
  folderName: string,
  manifestJson: any,
  posters: { filename: string; buffer: Buffer }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = createZipArchiverInstance({ zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err: any) => reject(err));

    // Append manifest.json
    archive.append(JSON.stringify(manifestJson, null, 2), {
      name: `${folderName}/manifest.json`
    });

    // Append each poster JPEG
    for (const p of posters) {
      archive.append(p.buffer, {
        name: `${folderName}/${p.filename}`
      });
    }

    archive.finalize();
  });
}

/**
 * Main 9-Poster Export Processor
 */
export async function exportNinePosters(params: {
  exportId?: string;
  workspaceId?: string;
  canvasId: string;
  createdBy?: string | null;
  idempotencyKey?: string;
}): Promise<NinePostersExportResult> {
  ensureExportsDir();
  const startTime = Date.now();
  const canvasId = params.canvasId;
  const workspaceId = params.workspaceId || 'default_workspace';
  const exportId = params.exportId || `export_${canvasId}_${Date.now()}`;
  const createdBy = params.createdBy || null;
  const idempotencyKey = params.idempotencyKey;

  if (idempotencyKey && memoryExportStore.has(idempotencyKey)) {
    return memoryExportStore.get(idempotencyKey)!;
  }

  console.log(`[exportNinePosters] Starting 9-poster batch export for canvas ${canvasId}...`);

  // 1. Calculate export version number
  let dbVer = 0;
  try {
    const { data: existingData } = await supabaseAdmin
      .from('detail_exports')
      .select('export_version_number')
      .eq('canvas_id', canvasId)
      .order('export_version_number', { ascending: false })
      .limit(1);

    if (existingData && existingData.length > 0) {
      dbVer = existingData[0].export_version_number || 0;
    }
  } catch (e) {}

  const prevLocalVer = localExportVersionsMap.get(canvasId) || 0;
  const exportVersionNumber = Math.max(dbVer, prevLocalVer) + 1;
  localExportVersionsMap.set(canvasId, exportVersionNumber);

  // 2. Fetch current 9-poster Layout Manifest
  const layoutManifest = await LayoutManifestService.getCurrentManifest(canvasId);
  const screens = layoutManifest?.screens && layoutManifest.screens.length === 9
    ? layoutManifest.screens.map((s, idx) => {
        const def = NINE_POSTERS_DEFAULT[idx] || NINE_POSTERS_DEFAULT.find(p => p.sceneKey === s.sceneKey);
        return {
          sceneKey: s.sceneKey,
          posterIndex: s.screenIndex || (idx + 1),
          sceneRole: def?.sceneRole || 'PRODUCT_HERO',
          title: def?.title || `Screen ${idx + 1}`,
          targetWidth: POSTER_SPEC.width,
          targetHeight: POSTER_SPEC.height,
          aspectRatio: POSTER_SPEC.aspectRatio,
          fitMode: s.fitMode,
          focalPoint: s.focalPoint,
          safeArea: s.safeArea,
          backgroundColor: s.backgroundColor
        };
      })
    : NINE_POSTERS_DEFAULT.map(p => ({
        sceneKey: p.sceneKey,
        posterIndex: p.posterIndex,
        sceneRole: p.sceneRole,
        title: p.title,
        targetWidth: POSTER_SPEC.width,
        targetHeight: POSTER_SPEC.height,
        aspectRatio: POSTER_SPEC.aspectRatio,
        fitMode: 'cover' as const,
        focalPoint: { x: 0.5, y: 0.5 },
        safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
        backgroundColor: '#FAF8F5'
      }));

  // 3. Assemble and render each of the 9 posters concurrently (concurrency limit = 3)
  const renderedPosters: {
    meta: PosterItemExport;
    buffer: Buffer;
  }[] = [];

  const posterTasks = screens.map((screen, idx) => ({
    sceneKey: screen.sceneKey,
    posterIndex: screen.posterIndex || (idx + 1),
    sceneRole: screen.sceneRole,
    title: screen.title
  }));

  const renderResults = await mapConcurrent(posterTasks, 3, async (task) => {
    const filename = `poster-${String(task.posterIndex).padStart(2, '0')}.jpg`;

    // A. Check if saved snapshot exists on disk or DB
    let snapshot: PosterCompositionSnapshot | null = null;
    const snapPath = path.join(process.cwd(), '.data', 'compositions', `${canvasId}_${task.sceneKey}.json`);
    if (fs.existsSync(snapPath)) {
      try {
        snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
      } catch (e) {}
    }

    // B. Assemble composition if snapshot not cached
    const composition = snapshot || await assembleScreenComposition({
      canvasId,
      workspaceId,
      screenId: `screen-${String(task.posterIndex).padStart(2, '0')}`,
      sceneKey: task.sceneKey,
      screenRole: task.sceneRole as any,
      slotHeight: POSTER_SPEC.height
    });

    // C. Render bitmap with Sharp
    const renderOutput = await renderDetailCompositionBitmap(composition);

    // D. Load the rendered JPEG buffer
    const localSavedPath = path.join(process.cwd(), '.data', 'compositions', task.sceneKey, `${renderOutput.compositionAssetVersionId}.jpg`);
    let imgBuffer: Buffer;
    if (fs.existsSync(localSavedPath)) {
      imgBuffer = fs.readFileSync(localSavedPath);
    } else {
      const fallbackDir = path.join(process.cwd(), '.data', 'compositions');
      const candPath = path.join(fallbackDir, `${renderOutput.compositionAssetVersionId}.jpg`);
      if (fs.existsSync(candPath)) {
        imgBuffer = fs.readFileSync(candPath);
      } else {
        throw new Error(`RENDER_FILE_MISSING: ${task.sceneKey}`);
      }
    }

    const checksum = `sha256_${crypto.createHash('sha256').update(imgBuffer).digest('hex').toLowerCase()}`;

    const posterMeta: PosterItemExport = {
      sceneKey: task.sceneKey,
      posterIndex: task.posterIndex,
      filename,
      width: POSTER_SPEC.width,
      height: POSTER_SPEC.height,
      assetVersionId: renderOutput.compositionAssetVersionId,
      objectKey: renderOutput.objectKey,
      publicUrl: renderOutput.publicUrl,
      fileSizeBytes: imgBuffer.length,
      checksum
    };

    return {
      meta: posterMeta,
      buffer: imgBuffer
    };
  });

  for (const res of renderResults) {
    renderedPosters.push(res);
  }

  // Sort posters by posterIndex
  renderedPosters.sort((a, b) => a.meta.posterIndex - b.meta.posterIndex);

  // 4. Create ZIP package
  const folderName = `manwah_${canvasId}_V00${exportVersionNumber}`;
  const zipFilename = `${folderName}.zip`;
  const zipBuffer = await createNinePostersZip(
    folderName,
    {
      exportId,
      canvasId,
      workspaceId,
      exportVersionNumber,
      spec: POSTER_SPEC,
      posters: renderedPosters.map(p => p.meta),
      createdAt: new Date().toISOString()
    },
    renderedPosters.map(p => ({
      filename: p.meta.filename,
      buffer: p.buffer
    }))
  );

  // 5. Save ZIP locally and upload to storage
  const localZipPath = path.join(LOCAL_EXPORTS_DIR, `${exportId}.zip`);
  fs.writeFileSync(localZipPath, zipBuffer);

  const zipObjectKey = `exports/${canvasId}/${exportId}/${zipFilename}`;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'creative-canvas-assets';
  let zipPublicUrl = `/api/canvases/${canvasId}/detail-exports/${exportId}/zip`;

  try {
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(zipObjectKey, zipBuffer, {
        contentType: 'application/zip',
        upsert: true
      });

    if (!uploadErr) {
      const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(zipObjectKey);
      if (urlData?.publicUrl) {
        zipPublicUrl = urlData.publicUrl;
      }
    }
  } catch (e) {
    console.warn('[DetailExportService] ZIP storage upload fallback to local URL:', e);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[exportNinePosters] Completed 9 posters export in ${durationMs}ms`);

  const result: NinePostersExportResult = {
    exportId,
    workspaceId,
    canvasId,
    exportVersionNumber,
    status: 'ready',
    zipObjectKey,
    zipPublicUrl,
    zipFileSizeBytes: zipBuffer.length,
    zipFilename,
    posters: renderedPosters.map(p => p.meta),
    manifest: layoutManifest,
    createdAt: new Date().toISOString()
  };

  // 6. Register in detail_exports DB table (using user_id / created_by safely)
  try {
    await supabaseAdmin.from('detail_exports').upsert({
      id: exportId,
      workspace_id: workspaceId,
      canvas_id: canvasId,
      export_version_number: exportVersionNumber,
      status: 'ready',
      object_key: zipObjectKey,
      public_url: zipPublicUrl,
      width: POSTER_SPEC.width,
      height: POSTER_SPEC.height,
      file_size_bytes: zipBuffer.length,
      checksum: `sha256_${crypto.createHash('sha256').update(zipBuffer).digest('hex').toLowerCase()}`,
      created_by: createdBy,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[DetailExportService] detail_exports DB register warning:', e);
  }

  memoryExportStore.set(exportId, result);
  if (idempotencyKey) {
    memoryExportStore.set(idempotencyKey, result);
  }

  return result;
}

export async function getNinePostersExport(
  canvasId: string,
  exportId: string
): Promise<NinePostersExportResult | null> {
  const cached = memoryExportStore.get(exportId);
  if (cached && cached.canvasId === canvasId) {
    return cached;
  }
  return cached || null;
}

// Backward-compatible alias for existing endpoints
export const processFullCanvasExport = exportNinePosters as any;
