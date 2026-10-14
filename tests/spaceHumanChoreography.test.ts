import { describe, it, expect } from 'vitest';
import { SpaceHumanChoreographyService } from '../server/services/spaceHumanChoreographyService';

describe('SpaceHumanChoreographyService (AI 人物编排与资产匹配)', () => {
  const mockModels = [
    {
      id: 'model-grandfather',
      name: 'Custom Grandfather',
      nameZh: '定制角色 · 睿智儒雅爷爷',
      roleType: 'grandfather',
      ageGroup: '68-72岁',
      positioning: '家族长者'
    },
    {
      id: 'model-grandmother',
      name: 'Custom Grandmother',
      nameZh: '定制角色 · 优雅慈祥奶奶',
      roleType: 'grandmother',
      ageGroup: '65-70岁',
      positioning: '家族长者'
    },
    {
      id: 'model-father',
      name: 'Custom Father',
      nameZh: '定制角色 · 沉稳儒雅男主人',
      roleType: 'father',
      ageGroup: '40-45岁',
      positioning: '家庭中枢'
    },
    {
      id: 'model-mother',
      name: 'Custom Mother',
      nameZh: '定制角色 · 优雅知性女主人',
      roleType: 'mother',
      ageGroup: '38-42岁',
      positioning: '生活美学主理人'
    },
    {
      id: 'model-daughter',
      name: 'Custom Daughter',
      nameZh: '定制角色 · 灵动女儿',
      roleType: 'daughter',
      ageGroup: '6-8岁',
      positioning: '天真小女儿'
    },
    {
      id: 'model-son',
      name: 'Custom Son',
      nameZh: '定制角色 · 活泼男孩',
      roleType: 'son',
      ageGroup: '7-9岁',
      positioning: '机敏小男孩'
    }
  ];

  it('能根据三代同堂提示词构思编排，并精确匹配 6 位角色', async () => {
    const result = await SpaceHumanChoreographyService.choreograph({
      prompt: '三代同堂家庭温馨时光，爷爷在电动沙发主座半躺，奶奶单人位品茶，男女主人交谈，两名孩子在地毯玩耍',
      characterCount: 6,
      availableModels: mockModels
    });

    expect(result).toBeDefined();
    expect(result.slots.length).toBe(6);
    expect(result.theme).toContain('三代同堂');

    // 检查是否成功匹配角色
    const matchedIds = result.slots.map(s => s.matchedModelId);
    expect(matchedIds).toContain('model-grandfather');
    expect(matchedIds).toContain('model-father');

    // 检查动作与空间位置描述
    for (const slot of result.slots) {
      expect(slot.positionDesc).toBeTruthy();
      expect(slot.actionDesc).toBeTruthy();
      expect(slot.matchedModelName).toBeTruthy();
    }
  });

  it('能根据四口亲子提示词构思编排，并返回 4 人槽位', async () => {
    const result = await SpaceHumanChoreographyService.choreograph({
      prompt: '四口之家，年轻夫妇带两个孩子周末互动',
      characterCount: 4,
      availableModels: mockModels
    });

    expect(result).toBeDefined();
    expect(result.slots.length).toBe(4);
    expect(result.slots[0].positionDesc).toBeTruthy();
    expect(result.slots[0].actionDesc).toBeTruthy();
  });
});
