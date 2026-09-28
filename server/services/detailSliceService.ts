import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from '../../src/lib/supabase';

export interface SliceSpec {
  sliceIndex: number;
  name: string;
  startY: number;
  endY: number;
  height: number;
}

export const FIVE_SLICES_SPEC: SliceSpec[] = [
  { sliceIndex: 1, name: '切片01-首屏概览', startY: 0, endY: 2800, height: 2800 },
  { sliceIndex: 2, name: '切片02-卖点与场景', startY: 2800, endY: 5400, height: 2600 },
  { sliceIndex: 3, name: '切片03-特写与功能', startY: 5400, endY: 9200, height: 3800 },
  { sliceIndex: 4, name: '切片04-材质与灵感', startY: 9200, endY: 12400, height: 3200 },
  { sliceIndex: 5, name: '切片05-参数与售后', startY: 12400, endY: 14800, height: 2400 }
];

export interface ProcessedSliceResult {
  id: string;
  exportId: string;
  workspaceId: string;
  canvasId: string;
  sliceIndex: number;
  sliceName: string;
  startY: number;
  endY: number;
  width: number;
  height: number;
  objectKey: string;
  publicUrl: string;
  fileSizeBytes: number;
  checksum: string;
}

const LOCAL_EXPORTS_DIR = path.join(process.cwd(), '.data', 'exports');

function ensureExportsDir() {
  if (!fs.existsSync(LOCAL_EXPORTS_DIR)) {
    fs.mkdirSync(LOCAL_EXPORTS_DIR, { recursive: true });
  }
}

export async function sliceLongCanvasImage(
  exportId: string,
  workspaceId: string,
  canvasId: string,
  longImageBuffer: Buffer,
  createdBy?: string | null
): Promise<ProcessedSliceResult[]> {
  ensureExportsDir();
  const results: ProcessedSliceResult[] = [];

  // Assert total height sum
  const totalHeight = FIVE_SLICES_SPEC.reduce((sum, s) => sum + s.height, 0);
  if (totalHeight !== 14800) {
    throw new Error(`Slice spec total height must equal 14800px, got ${totalHeight}`);
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'creative-canvas-assets';

  for (const spec of FIVE_SLICES_SPEC) {
    const sliceBuffer = await sharp(longImageBuffer)
      .extract({
        left: 0,
        top: spec.startY,
        width: 2100,
        height: spec.height
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    const fileSizeBytes = sliceBuffer.length;
    const checksum = `sha256_${crypto.createHash('sha256').update(sliceBuffer).digest('hex').toLowerCase()}`;
    const sliceId = `slice_${exportId}_0${spec.sliceIndex}`;
    const objectKey = `exports/${canvasId}/${exportId}/slice_0${spec.sliceIndex}.jpg`;

    // 1. Save locally for fallback static serving
    const localSlicePath = path.join(LOCAL_EXPORTS_DIR, `${sliceId}.jpg`);
    fs.writeFileSync(localSlicePath, sliceBuffer);

    let publicUrl = `/api/canvases/exports/file/${sliceId}`;

    // 2. Upload to Supabase Storage with fast timeout
    try {
      const uploadPromise = supabaseAdmin.storage
        .from(bucket)
        .upload(objectKey, sliceBuffer, { contentType: 'image/jpeg', upsert: true });

      const timeoutPromise = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Slice storage upload timeout')), 400)
      );

      const { error: uploadError }: any = await Promise.race([uploadPromise, timeoutPromise]);

      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectKey);
        if (urlData?.publicUrl) {
          publicUrl = urlData.publicUrl;
        }
      }
    } catch (e) {
      console.warn(`[DetailSliceService] Storage upload fallback for ${objectKey}`);
    }

    // 3. Register slice in Supabase DB with fast timeout
    try {
      const dbTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 400));
      const dbPromise = supabaseAdmin.from('detail_export_slices').upsert({
        id: sliceId,
        export_id: exportId,
        workspace_id: workspaceId,
        canvas_id: canvasId,
        slice_index: spec.sliceIndex,
        slice_name: spec.name,
        start_y: spec.startY,
        end_y: spec.endY,
        width: 2100,
        height: spec.height,
        object_key: objectKey,
        public_url: publicUrl,
        file_size_bytes: fileSizeBytes,
        checksum,
        created_by: createdBy || null
      }, { onConflict: 'id' });

      await Promise.race([dbPromise, dbTimeout]);
    } catch (e) {
      console.warn(`[DetailSliceService] DB insert fallback for slice ${sliceId}`);
    }

    results.push({
      id: sliceId,
      exportId,
      workspaceId,
      canvasId,
      sliceIndex: spec.sliceIndex,
      sliceName: spec.name,
      startY: spec.startY,
      endY: spec.endY,
      width: 2100,
      height: spec.height,
      objectKey,
      publicUrl,
      fileSizeBytes,
      checksum
    });
  }

  return results;
}
