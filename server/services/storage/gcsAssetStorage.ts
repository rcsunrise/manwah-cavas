// server/services/storage/gcsAssetStorage.ts
// MANWAH Space Studio｜统一 Google Cloud Storage 资产存储服务实现 V3.0
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Storage } from '@google-cloud/storage';
import {
  AssetObjectStorage,
  AssetStorageStatus,
  ObjectMetadata,
  PutObjectInput,
  SignedReadUrlResult,
  SignedUploadInput,
  SignedUploadUrlResult,
  StorageProviderType,
  StoredObject
} from './assetObjectStorage';

const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.data', 'space-storage');

export class GcsAssetStorage implements AssetObjectStorage {
  private static instance: GcsAssetStorage;
  private gcsStorage: Storage | null = null;
  private isGcsAvailable: boolean = false;
  private strictGcsMode: boolean = false;

  private defaultBucket: string = 'manwah-space-generated-prod';
  private sourceBucket: string = 'manwah-space-source-prod';
  private generatedBucket: string = 'manwah-space-generated-prod';
  private exportBucket: string = 'manwah-space-export-prod';

  private authMethod: string = 'none';
  private effectiveStorageIdentity: string | null = null;
  private runtimeMetadataIdentity: string | null = null;
  private initError: string | null = null;

  constructor() {
    this.initConfiguration();
    this.detectRuntimeMetadataIdentity();
  }

  public static getInstance(): GcsAssetStorage {
    if (!GcsAssetStorage.instance) {
      GcsAssetStorage.instance = new GcsAssetStorage();
    }
    return GcsAssetStorage.instance;
  }

  private initConfiguration(): void {
    this.strictGcsMode = process.env.STORAGE_STRICT_GCS === 'true';

    // Bucket 配置解析
    const baseBucket =
      process.env.GCS_GENERATED_BUCKET ||
      process.env.GCS_ASSET_BUCKET ||
      process.env.GCS_VIDEO_BUCKET ||
      'manwah-space-generated-prod';

    this.defaultBucket = baseBucket;
    this.sourceBucket = process.env.GCS_ASSET_BUCKET || baseBucket;
    this.generatedBucket = process.env.GCS_GENERATED_BUCKET || baseBucket;
    this.exportBucket = process.env.GCS_EXPORT_BUCKET || baseBucket;

    const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0557963301';

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
        console.error('[GcsAssetStorage] Fatal error parsing GCS_CREDENTIALS_JSON:', err.message);
        this.isGcsAvailable = false;
        this.authMethod = 'GCS_CREDENTIALS_JSON (INVALID)';
        this.initError = `Failed to parse GCS_CREDENTIALS_JSON: ${err.message}`;
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
      this.isGcsAvailable = true;
      console.log(`[GcsAssetStorage] Initialized with bucket '${this.defaultBucket}', auth: ${detectedAuth}, strictMode: ${this.strictGcsMode}`);
    } catch (err: any) {
      this.isGcsAvailable = false;
      this.initError = err.message;
      console.warn('[GcsAssetStorage] GCS initialization failed:', err.message);
    }

    if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
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
      // metadata server only exists inside GCP runtime
    }
  }

  private resolveBucketName(bucketType?: 'source' | 'generated' | 'export', customBucketName?: string): string {
    if (customBucketName && customBucketName.trim()) {
      return customBucketName.trim();
    }
    switch (bucketType) {
      case 'source':
        return this.sourceBucket;
      case 'export':
        return this.exportBucket;
      case 'generated':
      default:
        return this.generatedBucket;
    }
  }

  public getStatus(): AssetStorageStatus {
    const effectiveProvider: StorageProviderType = this.isGcsAvailable ? 'gcs' : 'local_fallback';
    return {
      isGcsAvailable: this.isGcsAvailable,
      strictGcsMode: this.strictGcsMode,
      effectiveProvider,
      authMethod: this.authMethod,
      effectiveStorageIdentity: this.effectiveStorageIdentity || this.runtimeMetadataIdentity,
      buckets: {
        source: this.sourceBucket,
        generated: this.generatedBucket,
        export: this.exportBucket
      },
      initError: this.initError
    };
  }

  /**
   * 写入不可变二进制对象到存储
   */
  public async put(input: PutObjectInput): Promise<StoredObject> {
    const {
      bucketType = 'generated',
      customBucketName,
      objectKey,
      buffer,
      contentType = 'image/webp',
      cacheControl = 'public, max-age=31536000, immutable',
      metadata = {}
    } = input;

    if (!objectKey || objectKey.trim() === '') {
      throw new Error('[GcsAssetStorage.put] Invalid objectKey provided');
    }

    const bucketName = this.resolveBucketName(bucketType, customBucketName);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 0. 始终同步写入本地热缓存 (保证零延迟直读、规避跨域与 signedUrl 404)
    const sanitizedKey = objectKey.replace(/\\/g, '/');
    const localFilePath = path.join(LOCAL_STORAGE_DIR, sanitizedKey);
    try {
      const parentDir = path.dirname(localFilePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(localFilePath, buffer);
    } catch (cacheErr: any) {
      console.warn(`[GcsAssetStorage.put] Local cache write warning for ${objectKey}:`, cacheErr.message);
    }

    // 1. 如果可用，优先写入真正的 GCS
    if (this.isGcsAvailable && this.gcsStorage) {
      try {
        const bucket = this.gcsStorage.bucket(bucketName);
        const file = bucket.file(objectKey);

        await file.save(buffer, {
          resumable: false,
          validation: 'crc32c',
          contentType,
          metadata: {
            cacheControl,
            metadata: {
              ...metadata,
              sha256
            }
          }
        });

        const [gcsMeta] = await file.getMetadata();

        return {
          storageProvider: 'gcs',
          bucket: bucketName,
          objectKey,
          bytes: buffer.length,
          sha256,
          crc32c: gcsMeta.crc32c,
          contentType,
          generation: gcsMeta.generation ? String(gcsMeta.generation) : undefined
        };
      } catch (err: any) {
        console.error(`[GcsAssetStorage.put] GCS write error for ${objectKey}:`, err.message);
        if (this.strictGcsMode) {
          throw new Error(`[GcsAssetStorage STRICT] Failed to write asset to GCS: ${err.message}`);
        }
      }
    } else if (this.strictGcsMode) {
      throw new Error(`[GcsAssetStorage STRICT] GCS is not available (${this.initError || 'uninitialized'}), local fallback is strictly prohibited.`);
    }

    // 2. 受控 Local Fallback (仅当未开启 strict 模式且处于开发环境)
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
   * 统一获取对象文件的 Buffer (优先从 GCS，回退到本地存储)
   */
  public async getBuffer(
    objectKey: string,
    bucketType: 'source' | 'generated' | 'export' = 'generated'
  ): Promise<Buffer | null> {
    const bucketName = this.resolveBucketName(bucketType);

    if (this.isGcsAvailable && this.gcsStorage) {
      try {
        const bucket = this.gcsStorage.bucket(bucketName);
        const file = bucket.file(objectKey);
        const [exists] = await file.exists();
        if (exists) {
          const [buf] = await file.download();
          return buf;
        }
      } catch (err: any) {
        console.warn(`[GcsAssetStorage.getBuffer] GCS download failed for ${objectKey}:`, err.message);
      }
    }

    const localFilePath = path.join(LOCAL_STORAGE_DIR, objectKey.replace(/\\/g, '/'));
    if (fs.existsSync(localFilePath)) {
      try {
        return fs.readFileSync(localFilePath);
      } catch (err: any) {
        console.warn(`[GcsAssetStorage.getBuffer] Local read failed for ${localFilePath}:`, err.message);
      }
    }

    return null;
  }

  /**
   * 检查对象元数据
   */
  public async getMetadata(
    objectKey: string,
    bucketType: 'source' | 'generated' | 'export' = 'generated'
  ): Promise<ObjectMetadata> {
    const bucketName = this.resolveBucketName(bucketType);

    if (this.isGcsAvailable && this.gcsStorage) {
      try {
        const bucket = this.gcsStorage.bucket(bucketName);
        const file = bucket.file(objectKey);
        const [exists] = await file.exists();

        if (!exists) {
          return { exists: false, size: 0, contentType: 'application/octet-stream' };
        }

        const [meta] = await file.getMetadata();
        return {
          exists: true,
          size: Number(meta.size) || 0,
          contentType: meta.contentType || 'application/octet-stream',
          updated: meta.updated,
          md5Hash: meta.md5Hash,
          crc32c: meta.crc32c,
          generation: meta.generation ? String(meta.generation) : undefined,
          customMetadata: (meta.metadata as Record<string, string>) || {}
        };
      } catch (err: any) {
        if (this.strictGcsMode) {
          throw err;
        }
      }
    }

    const localFilePath = path.join(LOCAL_STORAGE_DIR, objectKey.replace(/\\/g, '/'));
    if (!fs.existsSync(localFilePath)) {
      return { exists: false, size: 0, contentType: 'application/octet-stream' };
    }

    const stat = fs.statSync(localFilePath);
    return {
      exists: true,
      size: stat.size,
      contentType: 'application/octet-stream',
      updated: stat.mtime.toISOString()
    };
  }

  /**
   * 获取只读签名 URL
   */
  public async getSignedReadUrl(
    objectKey: string,
    ttlSeconds: number = 900,
    bucketType: 'source' | 'generated' | 'export' = 'generated'
  ): Promise<SignedReadUrlResult> {
    const bucketName = this.resolveBucketName(bucketType);

    if (this.isGcsAvailable && this.gcsStorage) {
      try {
        const bucket = this.gcsStorage.bucket(bucketName);
        const file = bucket.file(objectKey);

        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + ttlSeconds * 1000
        });

        return {
          url: signedUrl,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          provider: 'gcs'
        };
      } catch (err: any) {
        if (this.strictGcsMode) {
          throw err;
        }
      }
    }

    const fallbackUrl = `/api/space/storage/local-file?key=${encodeURIComponent(objectKey)}`;
    return {
      url: fallbackUrl,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      provider: 'local_fallback'
    };
  }

  /**
   * 获取预签名上传 URL
   */
  public async getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadUrlResult> {
    const {
      bucketType = 'generated',
      customBucketName,
      objectKey,
      contentType = 'image/webp',
      ttlSeconds = 900
    } = input;

    const bucketName = this.resolveBucketName(bucketType, customBucketName);

    if (this.isGcsAvailable && this.gcsStorage) {
      try {
        const bucket = this.gcsStorage.bucket(bucketName);
        const file = bucket.file(objectKey);

        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'write',
          contentType,
          expires: Date.now() + ttlSeconds * 1000
        });

        return {
          url: signedUrl,
          objectKey,
          bucket: bucketName,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          provider: 'gcs'
        };
      } catch (err: any) {
        if (this.strictGcsMode) {
          throw err;
        }
      }
    }

    // Local direct endpoint
    const fallbackUrl = `/api/space/storage/local-upload?key=${encodeURIComponent(objectKey)}`;
    return {
      url: fallbackUrl,
      objectKey,
      bucket: 'local-disk',
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      provider: 'local_fallback'
    };
  }

  /**
   * 检查对象是否存在
   */
  public async exists(
    objectKey: string,
    bucketType: 'source' | 'generated' | 'export' = 'generated'
  ): Promise<boolean> {
    const meta = await this.getMetadata(objectKey, bucketType);
    return meta.exists;
  }

  /**
   * 删除对象
   */
  public async delete(
    objectKey: string,
    bucketType: 'source' | 'generated' | 'export' = 'generated'
  ): Promise<void> {
    const bucketName = this.resolveBucketName(bucketType);

    if (this.isGcsAvailable && this.gcsStorage) {
      try {
        const bucket = this.gcsStorage.bucket(bucketName);
        const file = bucket.file(objectKey);
        await file.delete({ ignoreNotFound: true });
        return;
      } catch (err: any) {
        if (this.strictGcsMode) {
          throw err;
        }
      }
    }

    const localFilePath = path.join(LOCAL_STORAGE_DIR, objectKey.replace(/\\/g, '/'));
    if (fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
      } catch (e) {}
    }
  }

  /**
   * 本地开发文件直通 (供 Express 静态或安全流式中继)
   */
  public getLocalFilePath(objectKey: string): string | null {
    const localFilePath = path.join(LOCAL_STORAGE_DIR, objectKey.replace(/\\/g, '/'));
    return fs.existsSync(localFilePath) ? localFilePath : null;
  }
}
