import { describe, expect, it } from 'vitest';
import { STUDIO_CHOREOGRAPHY_TEMPLATES, mapStudioSlotsToAssignments, parseReclineAngle } from '../data/choreographyPresets';
import { spaceAssetLibraryService } from '../../../services/spaceAssetLibraryService';

const tpl = (id: string) => STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === id)!;
const compile = (slots: any[]) =>
  spaceAssetLibraryService.compileHumanLayoutPrompt({ characterCount: slots.length, mode: 'custom', disallowExtraCharacters: true, slots }, []).slotBriefs;

describe('recliner studio templates', () => {
  it('carries posture, props, recline angle and footrest into the slot', () => {
    const [slot] = mapStudioSlotsToAssignments(tpl('studio-tpl-a08-01'), []);
    expect(slot.reclineAngleDeg).toBe(160);
    expect(slot.footrestState).toBe('extended');
    expect(slot.actionDesc).toContain('安详闭目沉睡');
    expect(slot.actionDesc).toContain('160° 脊椎舒展平躺');
    expect(slot.actionDesc).toContain('米色羊绒盖毯');
  });

  it('asks the model to recline the backrest for the sleep template', () => {
    const briefs = compile(mapStudioSlotsToAssignments(tpl('studio-tpl-a08-01'), []));
    expect(briefs).toContain('reclined to approximately 160 degrees');
    expect(briefs).toContain('near-flat sleeping recline');
    expect(briefs).toContain('footrest of this designated seat MUST BE SMOOTHLY EXTENDED');
  });

  it('does not recline seats that give no angle', () => {
    expect(parseReclineAngle('主沙发中间固定位')).toBeUndefined();
    expect(parseReclineAngle('层高 3.5 米，35°侧角机位')).toBeUndefined();
    expect(compile([{ id: 's', positionDesc: '主沙发中间固定位', actionDesc: '端坐' }])).not.toContain('BACKREST RECLINE');
  });
});

import { labelLayoutAction, resolveActionLabel, templateActionLabel } from '../engine/choreographyMatching';
import { buildShotExportFileName } from '../engine/exportFileName';

describe('action label on people versions', () => {
  const slots = mapStudioSlotsToAssignments(tpl('studio-tpl-a08-01'), []);

  it('uses the template name while the action is unchanged', () => {
    const layout = { slots, ...labelLayoutAction(slots, templateActionLabel(tpl('studio-tpl-a08-01'))) };
    expect(resolveActionLabel(layout)).toBe('160°深度睡眠');
  });

  it('falls back to the action text once the action was edited', () => {
    const layout = { slots, ...labelLayoutAction(slots, '160°深度睡眠') };
    const edited = { ...layout, slots: [{ ...slots[0], actionDesc: '戴耳机闭目听歌，手指轻点扶手' }] };
    expect(resolveActionLabel(edited)).toBe('戴耳机闭目听歌');
    expect(resolveActionLabel({ slots: [...edited.slots, slots[0]] })).toBe('2人-戴耳机闭目听歌');
    expect(resolveActionLabel({ slots: [] })).toBeUndefined();
  });

  it('puts the action after the shot code in the export file name', () => {
    const base = { spaceName: '横厅', styleName: '静奢', shotCode: 'A08', revisionNumber: 5, createdAt: '2026-11-10T15:26:00', resolution: '4K', format: 'png' };
    expect(buildShotExportFileName({ ...base, actionLabel: '160°深度睡眠' })).toBe('MANWAH_横厅_静奢_A08_160°深度睡眠_v5_1110-152600_4K.png');
    expect(buildShotExportFileName(base)).toBe('MANWAH_横厅_静奢_A08_v5_1110-152600_4K.png');
  });
});
