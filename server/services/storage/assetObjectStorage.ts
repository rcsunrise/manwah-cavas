// server/services/storage/assetObjectStorage.ts
// MANWAH Space Studio｜统一对象存储抽象层契约 V3.0
// 业务层代码严禁直接 import @google-cloud/storage，必须通过本接口驱动。

export type StorageProviderType = 'gcs' | 'local_fallback';

export interface PutObjectInput {
  bucketType?: 'source' | 'generated' | 'export';
  customBucketName?: string;
  objectKey: string;
  buffer: Buffer;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface StoredObject {
  storageProvider: StorageProviderType;
  bucket: string;
  objectKey: string;
  bytes: number;
  sha256: string;
  crc32c?: string;
  contentType: string;
  generation?: string;
}

export interface ObjectMetadata {
  exists: boolean;
  size: number;
  contentType: string;
  updated?: string;
  md5Hash?: string;
  crc32c?: string;
  generation?: string;
  customMetadata?: Record<string, string>;
}

export interface SignedReadUrlResult {
  url: string;
  expiresAt: string;
  provider: StorageProviderType;
}

export interface SignedUploadInput {
  bucketType?: 'source' | 'generated' | 'export';
  customBucketName?: string;
  objectKey: string;
  contentType?: string;
  ttlSeconds?: number;
}

export interface SignedUploadUrlResult {
  url: string;
  objectKey: string;
  bucket: string;
  expiresAt: string;
  provider: StorageProviderType;
}

export interface AssetStorageStatus {
  isGcsAvailable: boolean;
  strictGcsMode: boolean;
  effectiveProvider: StorageProviderType;
  authMethod: string;
  effectiveStorageIdentity: string | null;
  buckets: {
    source: string;
    generated: string;
    export: string;
  };
  initError: string | null;
}

export interface AssetObjectStorage {
  getStatus(): AssetStorageStatus;
  put(input: PutObjectInput): Promise<StoredObject>;
  getMetadata(objectKey: string, bucketType?: 'source' | 'generated' | 'export'): Promise<ObjectMetadata>;
  getSignedReadUrl(objectKey: string, ttlSeconds?: number, bucketType?: 'source' | 'generated' | 'export'): Promise<SignedReadUrlResult>;
  getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadUrlResult>;
  exists(objectKey: string, bucketType?: 'source' | 'generated' | 'export'): Promise<boolean>;
  delete(objectKey: string, bucketType?: 'source' | 'generated' | 'export'): Promise<void>;
}
