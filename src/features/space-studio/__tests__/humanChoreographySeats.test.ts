import { describe, it, expect } from 'vitest';
import { spaceAssetLibraryService } from '../../../services/spaceAssetLibraryService';
import type { HumanLayoutConfig } from '../../../types/spaceAssetLibrary';

const compile = (slots: HumanLayoutConfig['slots']) =>
  spaceAssetLibraryService.compileHumanLayoutPrompt(
    { characterCount: slots.length, mode: 'custom', disallowExtraCharacters: true, slots },
    []
  ).humanDirectives;

const slotBlock = (text: string, index: number) => text.split(`[Character Slot #${index}`)[1]?.split('[Character Slot #')[0] || '';

describe('人物编排：结构化座位与脚托', () => {
  it('“主沙发中央功能位”不再被误判为展开脚托，并锚定在中间座', () => {
    const text = compile([
      { id: 's1', positionDesc: '主沙发一号电动功能主座（展开脚托）', actionDesc: '45°半躺小憩' },
      { id: 's2', positionDesc: '主沙发中央功能位', actionDesc: '从容端坐，与妻子交谈' }
    ]);
    const grandpa = slotBlock(text, 1);
    const father = slotBlock(text, 2);
    expect(grandpa).toContain('MUST BE SMOOTHLY EXTENDED');
    expect(grandpa).toContain('#1 power recliner seat');
    expect(father).not.toContain('MUST BE SMOOTHLY EXTENDED');
    expect(father).toContain('MIDDLE SEAT OF THE MAIN SECTIONAL SOFA');
    expect(father).not.toContain('#1 power recliner seat');
  });

  it('结构化 seatType / footrestState 优先于文字描述', () => {
    const text = compile([
      { id: 's1', positionDesc: '沙发上', actionDesc: '半躺', seatType: 'single_chair', footrestState: 'retracted' }
    ]);
    expect(text).toContain('standalone single leather accent recliner armchair');
    expect(text).toContain('stays fully retracted');
    expect(text).not.toContain('MUST BE SMOOTHLY EXTENDED');
  });

  it('地毯席地的人物不带脚托指令', () => {
    const text = compile([{ id: 's1', positionDesc: '茶几旁羊毛地毯上', actionDesc: '盘腿拼积木' }]);
    expect(text).toContain('wool carpet');
    expect(text).not.toContain('FOOTREST');
    expect(text).not.toContain('MUST BE SMOOTHLY EXTENDED');
  });
});
