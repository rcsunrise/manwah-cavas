// server/services/storage/__tests__/gcsAssetStorage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GcsAssetStorage } from '../gcsAssetStorage';
import fs from 'fs';
import path from 'path';

describe('GcsAssetStorage (G1 Asset Core Spec)', () => {
  let storage: GcsAssetStorage;

  beforeEach(() => {
    storage = GcsAssetStorage.getInstance();
  });

  it('provides a valid runtime status report with all buckets resolved', () => {
    const status = storage.getStatus();
    expect(status).toHaveProperty('isGcsAvailable');
    expect(status).toHaveProperty('strictGcsMode');
    expect(status).toHaveProperty('effectiveProvider');
    expect(status.buckets).toHaveProperty('source');
    expect(status.buckets).toHaveProperty('generated');
    expect(status.buckets).toHaveProperty('export');
  });

  it('correctly persists binary buffer and calculates SHA256 checksum', async () => {
    const testBuffer = Buffer.from('MANWAH Space Studio Test Binary Image Data 2026', 'utf-8');
    const objectKey = 'projects/test-proj/shots/shot-a01/revisions/rev-01/original.webp';

    const result = await storage.put({
      objectKey,
      buffer: testBuffer,
      contentType: 'image/webp'
    });

    expect(result.objectKey).toBe(objectKey);
    expect(result.bytes).toBe(testBuffer.length);
    expect(result.sha256).toBeDefined();
    expect(result.sha256.length).toBe(64); // Valid sha256 hex string

    // Check existence
    const exists = await storage.exists(objectKey);
    expect(exists).toBe(true);

    // Check metadata
    const metadata = await storage.getMetadata(objectKey);
    expect(metadata.exists).toBe(true);
    expect(metadata.size).toBe(testBuffer.length);

    // Clean up
    await storage.delete(objectKey);
    const existsAfterDelete = await storage.exists(objectKey);
    expect(existsAfterDelete).toBe(false);
  });

  it('generates signed read and upload urls with reasonable expiration', async () => {
    const objectKey = 'projects/test-proj/shots/shot-a02/revisions/rev-01/original.webp';

    const readUrlRes = await storage.getSignedReadUrl(objectKey, 600);
    expect(readUrlRes.url).toBeDefined();
    expect(readUrlRes.expiresAt).toBeDefined();

    const uploadUrlRes = await storage.getSignedUploadUrl({
      objectKey,
      contentType: 'image/webp',
      ttlSeconds: 600
    });
    expect(uploadUrlRes.url).toBeDefined();
    expect(uploadUrlRes.objectKey).toBe(objectKey);
  });

  it('rejects empty objectKey in put', async () => {
    await expect(
      storage.put({
        objectKey: '',
        buffer: Buffer.from('test')
      })
    ).rejects.toThrow('Invalid objectKey provided');
  });
});
