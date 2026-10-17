// tests/spaceStorageSeedsAndGcs.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GcsAssetStorage } from '../server/services/storage/gcsAssetStorage';

describe('全员模特与风格资产长期存储 (Seeds & GCS Dual Layer Storage)', () => {
  const SEEDS_DIR = path.join(process.cwd(), 'server', 'data', 'seeds');
  const SEED_MODELS_FILE = path.join(SEEDS_DIR, 'space_model_assets.json');
  const SEED_STYLES_FILE = path.join(SEEDS_DIR, 'space_scene_styles.json');
  const SEED_STORAGE_DIR = path.join(SEEDS_DIR, 'storage');

  it('1. 静态版本化种子目录必须包含完整的 6 个定制家庭角色资产', () => {
    expect(fs.existsSync(SEED_MODELS_FILE)).toBe(true);
    const content = fs.readFileSync(SEED_MODELS_FILE, 'utf-8');
    const models = JSON.parse(content);
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBe(6);

    const roles = models.map((m: any) => m.roleType);
    expect(roles).toContain('grandfather');
    expect(roles).toContain('grandmother');
    expect(roles).toContain('father');
    expect(roles).toContain('mother');
    expect(roles).toContain('son');
    expect(roles).toContain('daughter');
  });

  it('2. 静态版本化种子目录必须包含 7 个经典场景风格资产', () => {
    expect(fs.existsSync(SEED_STYLES_FILE)).toBe(true);
    const content = fs.readFileSync(SEED_STYLES_FILE, 'utf-8');
    const styles = JSON.parse(content);
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBe(7);
  });

  it('3. 模特资产中引用的所有关键切片图片必须在种子存储目录完整存在且非空', () => {
    expect(fs.existsSync(SEED_STORAGE_DIR)).toBe(true);
    const content = fs.readFileSync(SEED_MODELS_FILE, 'utf-8');
    const models = JSON.parse(content);

    const keys = new Set<string>();
    for (const m of models) {
      const raw = JSON.stringify(m);
      const matches = raw.matchAll(/key=([^"&#\\]+)/g);
      for (const match of matches) {
        keys.add(decodeURIComponent(match[1]));
      }
    }

    expect(keys.size).toBe(30);

    for (const key of keys) {
      const seedFilePath = path.join(SEED_STORAGE_DIR, key);
      expect(fs.existsSync(seedFilePath)).toBe(true);
      const stat = fs.statSync(seedFilePath);
      expect(stat.size).toBeGreaterThan(100);
    }
  });

  it('4. GcsAssetStorage 能在本地缓存未命中时透明回退并读取种子切片图', async () => {
    const storage = GcsAssetStorage.getInstance();
    const testKey = 'projects/manwah-space-default/models/model-muwfybau-c8c5b1/slice_front_1791276794149.webp';

    const localPath = storage.getLocalFilePath(testKey);
    expect(localPath).not.toBeNull();
    expect(fs.existsSync(localPath!)).toBe(true);

    const buf = await storage.getBuffer(testKey, 'source');
    expect(buf).not.toBeNull();
    expect(buf!.length).toBeGreaterThan(1000);
  });
});
