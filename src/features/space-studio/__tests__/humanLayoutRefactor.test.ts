// src/features/space-studio/__tests__/humanLayoutRefactor.test.ts
import { describe, it, expect } from 'vitest';
import { spaceAssetLibraryService } from '../../../services/spaceAssetLibraryService';
import {
  HumanLayoutConfig,
  DEFAULT_4_HUMAN_SLOTS,
  DEFAULT_6_HUMAN_SLOTS,
  ModelAsset
} from '../../../types/spaceAssetLibrary';

describe('Human Layout Refactor & Model Addition Flow', () => {
  it('DEFAULT_MODELS and DEFAULT_FAMILY_TEMPLATES are empty by default', () => {
    const models = spaceAssetLibraryService.getModels();
    expect(models).toEqual([]);

    const templates = spaceAssetLibraryService.getFamilyTemplates();
    expect(templates).toEqual([]);
  });

  it('compiles 4-person Human Layout prompt with positive and negative constraints', () => {
    const layout: HumanLayoutConfig = {
      mode: '4',
      characterCount: 4,
      disallowExtraCharacters: true,
      slots: DEFAULT_4_HUMAN_SLOTS
    };

    const compiled = spaceAssetLibraryService.compileHumanLayoutPrompt(layout, []);

    expect(compiled.positivePrompt).toContain('EXACT 4 PERSONS ONLY');
    expect(compiled.positivePrompt).toContain('Character Slot #1');
    expect(compiled.positivePrompt).toContain('Character Slot #4');
    expect(compiled.positivePrompt).toContain('STRICT LIMIT: EXACTLY 4 PERSONS. STRICTLY PROHIBIT ANY EXTRA BACKGROUND PEOPLE');

    expect(compiled.negativePrompt).toContain('extra people');
    expect(compiled.negativePrompt).toContain('bystanders');
    expect(compiled.negativePrompt).toContain('displaced furniture');
    expect(compiled.negativePrompt).toContain('changed sofa color');
  });

  it('compiles 6-person Human Layout prompt with bound models', () => {
    const mockModel: ModelAsset = {
      id: 'custom-model-01',
      type: 'model',
      name: '高定商务精英男士',
      nameZh: '高定商务精英男士',
      nameEn: 'Elite Gentleman',
      roleType: 'father',
      gender: 'male',
      ageGroup: '42岁成熟高管',
      temperamentKeywords: ['儒雅', '沉稳'],
      views: {
        front: 'https://example.com/front.jpg'
      },
      modelDna: {
        outfitStyle: '极简静奢风 (Quiet Luxury)'
      } as any,
      coverImage: 'https://example.com/cover.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
      tags: ['高管', '精英'],
      createdAt: new Date().toISOString()
    };

    const slotsWithModel = DEFAULT_6_HUMAN_SLOTS.map((s, idx) =>
      idx === 0 ? { ...s, modelId: mockModel.id, modelName: mockModel.nameZh } : s
    );

    const layout: HumanLayoutConfig = {
      mode: '6',
      characterCount: 6,
      disallowExtraCharacters: true,
      slots: slotsWithModel
    };

    const compiled = spaceAssetLibraryService.compileHumanLayoutPrompt(layout, [mockModel]);

    expect(compiled.positivePrompt).toContain('EXACT 6 PERSONS ONLY');
    expect(compiled.positivePrompt).toContain('Character Slot #1 - 高定商务精英男士');
    expect(compiled.positivePrompt).toContain('Quiet Luxury');
    expect(compiled.positivePrompt).toContain('Character Slot #6');
  });

  it('allows custom slot configuration and disallowExtraCharacters toggling', () => {
    const layout: HumanLayoutConfig = {
      mode: 'custom',
      characterCount: 2,
      disallowExtraCharacters: false,
      slots: [
        {
          id: 'custom-1',
          positionDesc: '主沙发正中',
          actionDesc: '端坐品茶'
        },
        {
          id: 'custom-2',
          positionDesc: '单人单椅',
          actionDesc: '阅读杂志'
        }
      ]
    };

    const compiled = spaceAssetLibraryService.compileHumanLayoutPrompt(layout, []);

    expect(compiled.positivePrompt).toContain('EXACT 2 PERSONS ONLY');
    expect(compiled.positivePrompt).not.toContain('STRICT REQUIREMENT: NO EXTRA PEOPLE');
    expect(compiled.negativePrompt).not.toContain('extra people');
    expect(compiled.negativePrompt).toContain('displaced furniture');
  });
});
