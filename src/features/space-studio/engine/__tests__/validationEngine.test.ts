// src/features/space-studio/engine/__tests__/validationEngine.test.ts
import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../validationEngine';
import { STANDARD_SHOT_TEMPLATES } from '../../data/shotTemplates';
import { INITIAL_MANWAH_PRODUCTS } from '../../data/productAssets';
import { ShotInstance } from '../../../../types/spaceStudio';

describe('ValidationEngine (Referee Model Decoupling)', () => {
  const shotA01: ShotInstance = {
    id: 'shot-a01',
    templateCode: 'A01',
    name: '空间主大全景',
    camera: STANDARD_SHOT_TEMPLATES[0].defaultCamera,
    intent: STANDARD_SHOT_TEMPLATES[0].intent,
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  };

  it('evaluates candidate shot and calculates weighted dimensional scores', () => {
    const report = ValidationEngine.evaluateShot({
      shot: shotA01,
      candidateImageKey: 'projects/test/shots/A01/rev1.webp',
      baselineMasterKey: 'projects/test/masters/A00/master.webp',
      productDNA: INITIAL_MANWAH_PRODUCTS[0]
    });

    expect(report.shotCode).toBe('A01');
    expect(report.pass).toBe(true);
    expect(report.gateLevel).toBe('L2');
    expect(report.score.productIdentity).toBeGreaterThanOrEqual(90);
    expect(report.score.placement).toBeGreaterThanOrEqual(90);
    expect(report.score.overall).toBeGreaterThanOrEqual(85);
    expect(report.reasons.length).toBeGreaterThan(0);
  });
});
