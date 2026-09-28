// server/services/storage/gcsVideoStorage.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Storage } from '@google-cloud/storage';

export interface StoredVideoObject {
  storageProvider: 'gcs' | 'local_fallback';
  bucket: string;
  objectKey: string;
  generation?: string;
  bytes: number;
  sha256: string;
  crc32c?: string;
  contentType: string;
}

export interface SignedPlaybackResult {
  url: string;
  expiresAt: string;
  provider: 'gcs' | 'local_fallback';
  rangeSupported: boolean;
}

const LOCAL_VIDEO_DIR = path.join(process.cwd(), '.data', 'videos');

export class GcsVideoStorage {
  private static instance: GcsVideoStorage;
  private gcsStorage: Storage | null = null;
  private bucketName: string | null = null;
  private isGcsAvailable: boolean = false;

  private authMethod: string = 'none';
  private effectiveStorageIdentity: string | null = null;
  private runtimeMetadataIdentity: string | null = null;
  private initError: string | null = null;

  constructor() {
    this.initGcs();
    this.detectRuntimeMetadataIdentity();
  }

  public static getInstance(): GcsVideoStorage {
    if (!GcsVideoStorage.instance) {
      GcsVideoStorage.instance = new GcsVideoStorage();
    }
    return GcsVideoStorage.instance;
  }

  private async detectRuntimeMetadataIdentity(): Promise<void> {
    try {
      const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(1500)
      });
      if (res.ok) {
        this.runtimeMetadataIdentity = (await res.text()).trim();
      }
    } catch {
      // Non-critical, metadata server only exists inside GCP
    }
  }

  private initGcs(): void {
    const bucket = process.env.GCS_VIDEO_BUCKET || 'manwah-canvas-video-0557963301';
    const projectId = process.env.GCP_PROJECT_ID || 'gen-lang-client-0557963301';

    let storageOptions: any = { projectId };
    let detectedAuth = 'ADC (Application Default Credentials)';

    if (process.env.GCS_CREDENTIALS_JSON) {
      detectedAuth = 'GCS_CREDENTIALS_JSON';
      try {
        const raw = process.env.GCS_CREDENTIALS_JSON.trim();
        const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
        const parsed = JSON.parse(jsonStr);

        if (!parsed.client_email || !parsed.private_key) {
          throw new Error('GCS_CREDENTIALS_JSON is missing client_email or private_key fields.');
        }

        storageOptions.credentials = {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          project_id: parsed.project_id || projectId
        };
        this.effectiveStorageIdentity = parsed.client_email;
        this.authMethod = detectedAuth;
      } catch (err: any) {
        console.error('[GcsVideoStorage] Fatal error parsing GCS_CREDENTIALS_JSON:', err.message);
        this.isGcsAvailable = false;
        this.authMethod = 'GCS_CREDENTIALS_JSON (INVALID)';
        this.initError = `Failed to parse GCS_CREDENTIALS_JSON: ${err.message}. Silent ADC fallback is prohibited.`;
        return;
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      detectedAuth = `GOOGLE_APPLICATION_CREDENTIALS (${process.env.GOOGLE_APPLICATION_CREDENTIALS})`;
      try {
        const parsed = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8'));
        this.effectiveStorageIdentity = parsed.client_email || 'from-key-file';
      } catch {
        this.effectiveStorageIdentity = 'key-file-unreadable';
      }
      this.authMethod = detectedAuth;
    } else if (process.env.GCS_KEY_FILE) {
      storageOptions.keyFilename = process.env.GCS_KEY_FILE;
      detectedAuth = `GCS_KEY_FILE (${process.env.GCS_KEY_FILE})`;
      try {
        const parsed = JSON.parse(fs.readFileSync(process.env.GCS_KEY_FILE, 'utf-8'));
        this.effectiveStorageIdentity = parsed.client_email || 'from-key-file';
      } catch {
        this.effectiveStorageIdentity = 'key-file-unreadable';
      }
      this.authMethod = detectedAuth;
    } else {
      this.authMethod = detectedAuth;
    }

    try {
      this.gcsStorage = new Storage(storageOptions);
      this.bucketName = bucket;
      this.isGcsAvailable = true;
      console.log(`[GcsVideoStorage] Initialized with bucket '${bucket}', auth method: ${detectedAuth}`);
    } catch (err: any) {
      console.warn('[GcsVideoStorage] GCS initialization failed, falling back to local storage:', err);
      this.isGcsAvailable = false;
      this.initError = err.message;
    }

    if (!fs.existsSync(LOCAL_VIDEO_DIR)) {
      fs.mkdirSync(LOCAL_VIDEO_DIR, { recursive: true });
    }
  }

  public getStatus(): {
    isGcsAvailable: boolean;
    bucketName: string | null;
    authMethod: string;
    effectiveStorageIdentity: string | null;
    runtimeMetadataIdentity: string | null;
    initError: string | null;
  } {
    return {
      isGcsAvailable: this.isGcsAvailable,
      bucketName: this.bucketName,
      authMethod: this.authMethod,
      effectiveStorageIdentity: this.effectiveStorageIdentity || this.runtimeMetadataIdentity,
      runtimeMetadataIdentity: this.runtimeMetadataIdentity,
      initError: this.initError
    };
  }

  /**
   * Persists a video buffer or file into storage
   */
  public async persistVideo(params: {
    workspaceId: string;
    canvasId: string;
    jobId: string;
    assetVersionId: string;
    buffer: Buffer;
    fileName?: string;
    contentType?: string;
  }): Promise<StoredVideoObject> {
    const { workspaceId, canvasId, jobId, assetVersionId, buffer, fileName = 'original.mp4', contentType = 'video/mp4' } = params;
    const objectKey = `creative-canvas/videos/${workspaceId}/${canvasId}/${jobId}/${assetVersionId}/${fileName}`;
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (this.isGcsAvailable && this.gcsStorage && this.bucketName) {
      try {
        const bucket = this.gcsStorage.bucket(this.bucketName);
        const file = bucket.file(objectKey);

        await file.save(buffer, {
          resumable: false,
          validation: 'crc32c',
          contentType,
          metadata: {
            cacheControl: 'private, max-age=0'
          }
        });

        const [metadata] = await file.getMetadata();
        return {
          storageProvider: 'gcs',
          bucket: this.bucketName,
          objectKey,
          generation: metadata.generation ? String(metadata.generation) : undefined,
          bytes: buffer.length,
          sha256,
          crc32c: metadata.crc32c,
          contentType
        };
      } catch (err) {
        console.error('[GcsVideoStorage] Real GCS upload failed, falling back to local fallback disk:', err);
      }
    }

    // Local Fallback
    const localTargetDir = path.join(LOCAL_VIDEO_DIR, workspaceId, canvasId, jobId, assetVersionId);
    if (!fs.existsSync(localTargetDir)) {
      fs.mkdirSync(localTargetDir, { recursive: true });
    }
    const localFilePath = path.join(localTargetDir, fileName);
    fs.writeFileSync(localFilePath, buffer);

    return {
      storageProvider: 'local_fallback',
      bucket: 'local-disk',
      objectKey,
      bytes: buffer.length,
      sha256,
      contentType
    };
  }

  /**
   * Creates a signed or authenticated temporary playback URL
   */
  public async createPlaybackUrl(objectKey: string, ttlSeconds: number = 900): Promise<SignedPlaybackResult> {
    if (this.isGcsAvailable && this.gcsStorage && this.bucketName) {
      try {
        const bucket = this.gcsStorage.bucket(this.bucketName);
        const file = bucket.file(objectKey);
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + ttlSeconds * 1000
        });

        return {
          url: signedUrl,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          provider: 'gcs',
          rangeSupported: true
        };
      } catch (err) {
        console.warn('[GcsVideoStorage] GCS getSignedUrl failed, falling back to local route URL:', err);
      }
    }

    // Local route fallback
    const fallbackUrl = `/api/canvases/assets/video?key=${encodeURIComponent(objectKey)}`;
    return {
      url: fallbackUrl,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      provider: 'local_fallback',
      rangeSupported: true
    };
  }

  /**
   * Reads a local file buffer (used for range streaming or local asset proxy)
   */
  public getLocalFileStream(objectKey: string): { filePath: string; exists: boolean; size: number } | null {
    // objectKey format: creative-canvas/videos/{workspaceId}/{canvasId}/{jobId}/{assetVersionId}/{fileName}
    const parts = objectKey.split('/').slice(2); // drop 'creative-canvas/videos'
    const filePath = path.join(LOCAL_VIDEO_DIR, ...parts);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stat = fs.statSync(filePath);
    return {
      filePath,
      exists: true,
      size: stat.size
    };
  }
}
