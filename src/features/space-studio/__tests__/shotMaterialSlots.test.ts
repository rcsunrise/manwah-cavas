import { describe, expect, it } from 'vitest';
import { buildShotMaterialSlots, getMaterialSlotShotIds, pickEmptySlotsForFiles, selectBatchShotsByMaterial } from '../engine/shotMaterialSlots';

const shot = (id: string, templateCode: string, customReferenceImage?: string) => ({ id, templateCode, name: templateCode, customReferenceImage });
const shots = [shot('s0', 'A00'), shot('s1', 'A01', 'a01.jpg'), shot('s2', 'A02'), shot('s3', 'A03', 'a03.jpg'), shot('s10', 'A10')];

describe('shot material slots', () => {
  it('merges A00 and A01 into one slot and keeps the others one-to-one', () => {
    const slots = buildShotMaterialSlots(shots);
    expect(slots.map((s) => s.label)).toEqual(['A00 / A01', 'A02', 'A03', 'A10']);
    expect(slots[0]).toMatchObject({ shotIds: ['s0', 's1'], image: 'a01.jpg' });
    expect(getMaterialSlotShotIds(shots, 's0')).toEqual(['s0', 's1']);
    expect(getMaterialSlotShotIds(shots, 's2')).toEqual(['s2']);
  });

  it('fills empty slots in order and ignores extra files', () => {
    const slots = buildShotMaterialSlots(shots);
    expect(pickEmptySlotsForFiles(slots, 5).map((s) => s.label)).toEqual(['A02', 'A10']);
    expect(pickEmptySlotsForFiles(slots, 1).map((s) => s.label)).toEqual(['A02']);
  });

  it('batch generation only runs shots with material once any material exists', () => {
    const candidates = shots.filter((s) => s.templateCode !== 'A00');
    const { shots: run, skipped } = selectBatchShotsByMaterial(candidates, shots);
    expect(run.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(skipped.map((s) => s.id)).toEqual(['s2', 's10']);
    const none = shots.map((s) => ({ ...s, customReferenceImage: undefined }));
    expect(selectBatchShotsByMaterial(none, none).shots).toHaveLength(5);
  });
});
